const serviceName = WechatService.serviceName;

WechatService.withinWeChatBrowser = (/micromessenger/i).test(navigator.userAgent);

WechatService.signInMethodCfgs = {
  mp: {
    appIdField: 'mpAppId',
    scope: 'snsapi_userinfo',
    endpoint: 'oauth2/authorize'
  },
  webapp: {
    appIdField: 'appId',
    scope: 'snsapi_login',
    endpoint: 'qrconnect'
  },
  mobile: {
    appIdField: 'mobileAppId',
    scope: 'snsapi_userinfo'
  }
};

// Request Wechat credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
WechatService.requestCredential = function (options, credentialRequestCompleteCallback) {
  // support both (options, callback) and (callback).
  if (!credentialRequestCompleteCallback && typeof options === 'function') {
    credentialRequestCompleteCallback = options
    options = {}
  } else if (!options) {
    options = {}
  }

  var config = ServiceConfiguration.configurations.findOne({service: serviceName})
  if (!config) {
    credentialRequestCompleteCallback && credentialRequestCompleteCallback(
      new ServiceConfiguration.ConfigError()
    )
    return
  }

  WechatService.signInMethod = WechatService.withinWeChatBrowser && !!config.mpAppId ? 'mp' : 'webapp';
  if (Meteor.isCordova && config.mobileAppId && Wechat) {
    Wechat.isInstalled(function(installed) {
      if (!installed) {
        return prepareLogin(launchLogin);
      }
      // WeChat app is installed
      WechatService.signInMethod = 'mobile';

      prepareLogin(function(signInMethodCfg, state) {
        Wechat.auth(signInMethodCfg.scope, state, function(response) {
          // send the 3rd party response directly to the server for processing
          Meteor.call('handleWeChatOauthRequest', response, function(err, credentials) {
            //console.log('handleWeChatOauthRequest ret:', err, JSON.stringify(credentials));
            if (err) {
              credentialRequestCompleteCallback && credentialRequestCompleteCallback(
                new Meteor.Error("unauthroized", "WeChat handle oauth failed: " + err)
              );
              return;
            }
            OAuth._handleCredentialSecret(credentials.credentialToken, credentials.credentialSecret);
            credentialRequestCompleteCallback && credentialRequestCompleteCallback(
              credentials.credentialToken
            );
          });
        }, function(reason) {
          credentialRequestCompleteCallback && credentialRequestCompleteCallback(
            new Meteor.Error("unauthroized", "WeChat authorization failed: " + reason)
          );
        });
      });

    }, function (reason) {
      return prepareLogin(launchLogin);
    });
  }
  else {
    prepareLogin(launchLogin);
  }

  function prepareLogin(callback) {
    let signInMethodCfg = WechatService.signInMethodCfg = WechatService.signInMethodCfgs[WechatService.signInMethod];
    var appId = signInMethodCfg.appId = config[signInMethodCfg.appIdField];

    var credentialToken = Random.secret()
    var scope = (options && options.requestPermissions) || signInMethodCfg.scope;
    scope = _.map(scope, encodeURIComponent).join(',')
    var loginStyle = OAuth._loginStyle(serviceName, config, options)

    if (OAuth._stateParamAsync) {
      OAuth._stateParamAsync(loginStyle, credentialToken, options.redirectUrl, {appId}, (err, state) => {
        if (err) {
          console.error(err)
        } else {
          callback(signInMethodCfg, state, loginStyle, credentialToken)
        }
      })
    } else {
      var state = OAuth._stateParam(loginStyle, credentialToken, options.redirectUrl, {appId});
      callback(signInMethodCfg, state, loginStyle, credentialToken)
    }
  }

  function launchLogin (signInMethodCfg, state, loginStyle, credentialToken) {
    var loginUrl =
      'https://open.weixin.qq.com/connect/' + signInMethodCfg.endpoint +
      '?appid=' + signInMethodCfg.appId +
      '&redirect_uri=' + OAuth._redirectUri(serviceName, config, null, {replaceLocalhost: true}) +
      '&response_type=code' +
      '&scope=' + signInMethodCfg.scope +
      '&state=' + state +
      '#wechat_redirect'

    OAuth.launchLogin({
      loginService: serviceName,
      loginStyle: loginStyle,
      loginUrl: loginUrl,
      credentialRequestCompleteCallback: credentialRequestCompleteCallback,
      credentialToken: credentialToken
    })
  }
}

Meteor.loginWithWechat = function (options, callback) {
  // support a callback without options
  if (!callback && typeof options === 'function') {
    callback = options
    options = null
  }

  var credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback)
  WechatService.requestCredential(options, credentialRequestCompleteCallback)
}