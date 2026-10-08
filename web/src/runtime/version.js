/**
 * 网页客户端版本。
 *
 * 服务端按客户端类型分别设最低版本：小程序读 `MIN_CLIENT_VERSION`，
 * 网页读 `MIN_WEB_CLIENT_VERSION`。网页每次发布改动接口调用方式时递增这里的版本号，
 * 不需要和小程序的版本号保持一致。
 */
export const WEB_CLIENT_VERSION = '1.0.0';

export const WEB_CLIENT_TYPE = 'web';
