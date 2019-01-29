import { check } from 'meteor/check';
import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions({
  'wechat-oauth': '*'
}, 'ulion:accounts-wechat');

const WeChatOAuth = require('wechat-oauth');

const whitelistedFields = [
  'nickname',
  'sex',
  'language',
  'province',
  'city',
  'country',
  'headimgurl',
  'privilege'
];

const serviceName = WechatService.serviceName;
const serviceVersion = 2;
const serviceUrls = null;
let useUnionIdAsMainId = false;

const getServiceConfig = function() {
  let config = ServiceConfiguration.configurations.findOne({
    service: serviceName
  });
  if (!config)
    throw new ServiceConfiguration.ConfigError();
  useUnionIdAsMainId = config.mainId === 'unionId';
  return config;
}

const serviceHandler = function(query) {
  let config = getServiceConfig();

  let response = getTokenResponse(config, query);

  const expiresAt = (+new Date) + (1000 * parseInt(response.expiresIn, 10));
  const {
    appId,
    accessToken,
    scope,
    openId,
    unionId
  } = response;
  let serviceData = {
    appId,
    accessToken,
    expiresAt,
    openId,
    unionId,
    scope,
    id: useUnionIdAsMainId ? unionId : openId // id is required by Meteor
  };

  // only set the token in serviceData if it's there. this ensures
  // that we don't lose old ones
  if (response.refreshToken)
    serviceData.refreshToken = response.refreshToken;

  let identity = getIdentity(accessToken, openId);
  let fields = _.pick(identity, whitelistedFields);
  _.extend(serviceData, fields);

  return {
    serviceData: serviceData,
    options: {
      profile: fields
    }
  };
};

let getTokenResponse = function(config, query) {
  let state;
  try {
    state = OAuth._stateFromQuery(query);
  } catch (err) {
    throw new Error("Failed to extract state in OAuth callback with Wechat: " + query.state);
  }
  let response;
  try {
    let params = {
      code: query.code,
      appid: state.appId,
      secret: OAuth.openSecret(state.appId === config.mpAppId ? config.mpSecret : (state.appId === config.mobileAppId ? config.mobileSecret : config.secret)),
      grant_type: 'authorization_code'
    };
    //console.log('request wechat access token:', params);
    //Request an access token
    response = HTTP.get(
      "https://api.weixin.qq.com/sns/oauth2/access_token", {
        params
      }
    );

    if (response.statusCode !== 200 || !response.content)
      throw {
        message: "HTTP response error",
        response: response
      };

    response.content = JSON.parse(response.content);
    //console.log('wechat access token req ret:', response.content);
    if (response.content.errcode)
      throw {
        message: response.content.errcode + " " + response.content.errmsg,
        response: response
      };
  } catch (err) {
    throw _.extend(new Error("Failed to complete OAuth handshake with WechatService. " + err.message), {
      response: err.response
    });
  }

  return {
    appId: state.appId,
    accessToken: response.content.access_token,
    expiresIn: response.content.expires_in,
    refreshToken: response.content.refresh_token,
    scope: response.content.scope,
    openId: response.content.openid,
    unionId: response.content.unionid
  };
};

let getIdentity = function(accessToken, openId) {
  try {
    let response = HTTP.get("https://api.weixin.qq.com/sns/userinfo", {
      params: {
        access_token: accessToken,
        openid: openId,
        lang: 'zh-CN'
      }
    });

    if (response.statusCode !== 200 || !response.content)
      throw {
        message: "HTTP response error",
        response: response
      };

    response.content = JSON.parse(response.content);
    if (response.content.errcode)
      throw {
        message: response.content.errcode + " " + response.content.errmsg,
        response: response
      };

    return response.content;
  } catch (err) {
    throw _.extend(new Error("Failed to fetch identity from WechatService. " + err.message), {
      response: err.response
    });
  }
};

// register OAuth service
OAuth.registerService(serviceName, serviceVersion, serviceUrls, serviceHandler);

// retrieve credential
WechatService.retrieveCredential = function(credentialToken, credentialSecret) {
  return OAuth.retrieveCredential(credentialToken, credentialSecret);
};

Accounts.addAutopublishFields({
  forLoggedInUser: _.map(
    // why not publish openId and unionId?
    whitelistedFields.concat(['accessToken', 'expiresAt']), // don't publish refresh token
    function(subfield) {
      return 'services.' + serviceName + '.' + subfield;
    }
  ),

  forOtherUsers: _.map(
    whitelistedFields,
    function(subfield) {
      return 'services.' + serviceName + '.' + subfield;
    })
});

let wechatOAuthAPI = null;
let sessionKeys = {};

const getWeChatOAuthAPI = function() {
  if (wechatOAuthAPI) {
    return wechatOAuthAPI;
  }
  let config = getServiceConfig();

  return wechatOAuthAPI = new WeChatOAuth(
    config.miniAppId,
    OAuth.openSecret(config.miniSecret),
    // XXX: store the token somewhere, and probably also allow the project custom
    //      the token load/save handler in the project rather than in this package code.
    /* function (openid, callback) {
      // 传入一个根据openid获取对应的全局token的方法
      // 在getUser时会通过该方法来获取token
      Token.getToken(openid, callback);
    }, function (openid, token, callback) {
      // 持久化时请注意，每个openid都对应一个唯一的token!
      Token.setToken(openid, token, callback);
    }, */
    WechatService.getToken || null,
    function(openid, token, callback) {
      sessionKeys[openid] = token;
      WechatService.setToken && WechatService.setToken(openid, token, callback) || callback();
    },
    true
  );
}

const miniAppServiceHandler = function(query) {
  return new Promise(function(resolve, reject) {
    getWeChatOAuthAPI().getUserByCode(query, function(err, response) {
      if (err) {
        return reject(err);
      }
      const {
        watermark,
        openId,
        unionId
      } = response;
      let serviceData = {
        appId: watermark.appid,
        sessionKey: sessionKeys[openId],
        openId,
        unionId,
        id: useUnionIdAsMainId ? unionId : openId // id is required by Meteor
      };

      let fields = _.pick(response, whitelistedFields);
      fields.nickname = response.nickName;
      fields.sex = response.gender;
      fields.headimgurl = response.avatarUrl;
      _.extend(serviceData, fields);

      resolve({
        serviceData: serviceData,
        options: {
          profile: fields
        }
      });
    });
  });
};

Meteor.methods({
  handleWeChatOauthRequest: function(query) {
    // allow the client with 3rd party authorization code to directly ask server to handle it
    check(query.code, String);
    let oauthResult = serviceHandler(query);
    let credentialSecret = Random.secret();

    //let credentialToken = OAuth._credentialTokenFromQuery(query);
    let credentialToken = query.state;
    // Store the login result so it can be retrieved in another
    // browser tab by the result handler
    OAuth._storePendingCredential(credentialToken, {
      serviceName: serviceName,
      serviceData: oauthResult.serviceData,
      options: oauthResult.options
    }, credentialSecret);

    // return the credentialToken and credentialSecret back to client
    return {
      'credentialToken': credentialToken,
      'credentialSecret': credentialSecret
    };
  },
  weChatMiniAppLogin: async function(query) {
    // accept wechat mini app wx.login() result 'code' and wx.getUserInfo() result iv and encryptedData
    check(query.code, String);
    check(query.encryptedData, String);
    check(query.iv, String);
    //query.state = 'wechat-mini-app';
    let oauthResult = await miniAppServiceHandler(query);
    let credentialSecret = Random.secret();

    // Use the code as token
    let credentialToken = query.code;
    // Store the login result so it can be retrieved in another
    // browser tab by the result handler
    OAuth._storePendingCredential(credentialToken, {
      serviceName: serviceName,
      serviceData: oauthResult.serviceData,
      options: oauthResult.options
    }, credentialSecret);

    // XXX: what if we directly call the login with oauth token/secret?
    //      do we need response the token/secret and let client do the oauth login call
    //      or we can directly do it here???? we need test
    /* return Meteor.call('login', {
      oauth: {
        credentialToken: credentialToken,
        credentialSecret: credentialSecret
      }
    }); */

    // return the credentialToken and credentialSecret back to client
    return {
      'credentialToken': credentialToken,
      'credentialSecret': credentialSecret
    };
  }
});
