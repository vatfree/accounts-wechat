Package.describe({
    name: 'vatfree:accounts-wechat',
    version: '0.6.1',
    summary: 'meteor accounts package for wechat',
    git: 'https://github.com/vatfree/accounts-wechat',
    documentation: 'README.md'
});

Package.onUse(function (api) {
    api.versionsFrom('2.3');
    api.use('ecmascript');
    api.use('underscore');
    api.use('random');
    api.use('service-configuration');
    api.use('accounts-base');
    api.use('oauth');
    api.use('oauth2');
    api.use('accounts-oauth');
    api.use('http', 'server');
    api.use('templating', 'client');
    api.use('tmeasday:check-npm-versions@0.3.2');

    api.imply('accounts-base');

    api.addFiles('common.js');
    api.addFiles('client.js', 'client');
    api.addFiles('server.js', 'server');

    api.addFiles('wechat_configure.html', 'client');
    api.addFiles('wechat_configure.js', 'client');
    api.addFiles('wechat_login_button.css', 'client');

    api.export('WechatService')
});

/*
// this dependency is optional, only if the cordova wechat plugin is installed and mobileAppId is configured.
Cordova.depends({
    'cordova-plugin-wechat': '2.3.0'
});
*/
