const serviceName = Wechat.serviceName;

Wechat.withinWeChatBrowser = (/micromessenger/i).test(navigator.userAgent);

// Request Wechat credentials for the user
// @param options {optional}
// @param credentialRequestCompleteCallback {Function} Callback function to call on
//   completion. Takes one argument, credentialToken on success, or Error on
//   error.
Wechat.requestCredential = function (options, credentialRequestCompleteCallback) {
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

  Wechat.signInWithMP = Wechat.withinWeChatBrowser && config.mpAppId;
  var appId = Wechat.signInWithMP ? config.mpAppId : config.appId;

  var credentialToken = Random.secret()
  var scope = (options && options.requestPermissions) || [Wechat.signInWithMP ? 'snsapi_userinfo' : 'snsapi_login']
  scope = _.map(scope, encodeURIComponent).join(',')
  var loginStyle = OAuth._loginStyle(serviceName, config, options)

  if (OAuth._stateParamAsync) {
    OAuth._stateParamAsync(loginStyle, credentialToken, options.redirectUrl, {appId}, (err, state) => {
      if (err) {
        console.error(err)
      } else {
        launchLogin(state)
      }
    })
  } else {
    var state = OAuth._stateParam(loginStyle, credentialToken, options.redirectUrl, {appId})
    launchLogin(state)
  }

  function launchLogin (state) {
    var loginUrl =
      'https://open.weixin.qq.com/connect/' + (Wechat.signInWithMP ? 'oauth2/authorize' : 'qrconnect') +
      '?appid=' + appId +
      '&redirect_uri=' + OAuth._redirectUri(serviceName, config, null, {replaceLocalhost: true}) +
      '&response_type=code' +
      '&scope=' + scope +
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
  Wechat.requestCredential(options, credentialRequestCompleteCallback)
}