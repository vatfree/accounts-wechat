import { check } from 'meteor/check';

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
const serviceHandler = function (query) {
    var config = ServiceConfiguration.configurations.findOne({service: serviceName});
    if (!config)
        throw new ServiceConfiguration.ConfigError();

    var response = getTokenResponse(config, query);

    const expiresAt = (+new Date) + (1000 * parseInt(response.expiresIn, 10));
    const {appId, accessToken, scope, openId, unionId} = response;
    let serviceData = {
        appId,
        accessToken,
        expiresAt,
        openId,
        unionId,
        scope,
        id: config.mainId === 'unionId' ? unionId : openId // id is required by Meteor
    };

    // only set the token in serviceData if it's there. this ensures
    // that we don't lose old ones
    if (response.refreshToken)
        serviceData.refreshToken = response.refreshToken;

    var identity = getIdentity(accessToken, openId);
    var fields = _.pick(identity, whitelistedFields);
    _.extend(serviceData, fields);

    return {
        serviceData: serviceData,
        options: {
            profile: fields
        }
    };
};

var getTokenResponse = function (config, query) {
    var state;
    try {
        state = OAuth._stateFromQuery(query);
    } catch (err) {
        throw new Error("Failed to extract state in OAuth callback with Wechat: " + query.state);
    }
    var response;
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
            throw {message: "HTTP response error", response: response};

        response.content = JSON.parse(response.content);
        //console.log('wechat access token req ret:', response.content);
        if (response.content.errcode)
            throw {message: response.content.errcode + " " + response.content.errmsg, response: response};
    } catch (err) {
        throw _.extend(new Error("Failed to complete OAuth handshake with WechatService. " + err.message),
            {response: err.response});
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

var getIdentity = function (accessToken, openId) {
    try {
        var response = HTTP.get("https://api.weixin.qq.com/sns/userinfo", {
                params: {access_token: accessToken, openid: openId, lang: 'zh-CN'}
            }
        );

        if (response.statusCode !== 200 || !response.content)
            throw {message: "HTTP response error", response: response};

        response.content = JSON.parse(response.content);
        if (response.content.errcode)
            throw {message: response.content.errcode + " " + response.content.errmsg, response: response};

        return response.content;
    } catch (err) {
        throw _.extend(new Error("Failed to fetch identity from WechatService. " + err.message),
            {response: err.response});
    }
};

// register OAuth service
OAuth.registerService(serviceName, serviceVersion, serviceUrls, serviceHandler);

// retrieve credential
WechatService.retrieveCredential = function (credentialToken, credentialSecret) {
    return OAuth.retrieveCredential(credentialToken, credentialSecret);
};

Accounts.addAutopublishFields({
    forLoggedInUser: _.map(
        // why not publish openId and unionId?
        whitelistedFields.concat(['accessToken', 'expiresAt']), // don't publish refresh token
        function (subfield) { return 'services.' + serviceName + '.' + subfield; }
    ),

    forOtherUsers: _.map(
        whitelistedFields,
        function (subfield) { return 'services.' + serviceName + '.' + subfield; })
});

Meteor.methods({
  handleWeChatOauthRequest: function(query) {
    // allow the client with 3rd party authorization code to directly ask server to handle it
    check(query.code, String);
    var oauthResult = serviceHandler(query);
    var credentialSecret = Random.secret();

    //var credentialToken = OAuth._credentialTokenFromQuery(query);
    var credentialToken = query.state;
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
  }
});