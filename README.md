# ulion:accounts-wechat
Meteor accounts package for wechat.
Because this package is generally used in China, this doc will be written in chinese.

## 简介
- 使Meteor应用支持微**微信开放平台**登录
- 支持绑定**微信公众平台**登录
- 在微信浏览器内利用OAuth登录，在微信浏览器之外为扫码登录

## 用法

### 1. 添加包
```
meteor add ulion:accounts-wechat
meteor add service-configuration
```

### 2. 配置
server端：
```
ServiceConfiguration.configurations.upsert({
    service: Wechat.serviceName // 可以通过Meteor.settings.public.wechatServiceName来修改这个值
}, {
    $set: {
        appId: '...',
        secret: '...',
        mainId: 'unionId'
    }
});
```

### 3. 登录
client端：
```
Meteor.loginWithWechat(function(err, res){
   ...
})
```

### Note
微信开放平台相关应用的授权回调域、对应Meteor应用的ROOT_URL以及用户访问该应用的实际url必须保持一致。
