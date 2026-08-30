'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const RETIRED_STATUS = 'legacy_api_retired';
const RETIRED_MESSAGE = '此功能已停用';
let sideEffectCalls = 0;

function failOnCall() {
  sideEffectCalls += 1;
  throw new Error('退役接口不应调用依赖');
}

function loadRouter(modulePath, mocks) {
  const resolvedPath = require.resolve(modulePath);
  delete require.cache[resolvedPath];
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }
}

function routeHandler(router, routePath) {
  const layer = router.stack.find((item) => item.route && item.route.path === routePath);
  assert(layer, `缺少兼容路由：${routePath}`);
  return layer.route.stack[0].handle;
}

async function invoke(router, routePath) {
  let body;
  let statusCode = 200;
  const requestBody = new Proxy({}, {
    get() {
      throw new Error('退役接口不应读取请求体');
    }
  });
  const req = { body: requestBody, openid: 'legacy-openid', requestId: 'retired-endpoint-test' };
  const res = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      body = value;
      return value;
    }
  };
  await routeHandler(router, routePath)(req, res);
  return { statusCode, body };
}

function assertRetiredResponse(result, routePath) {
  assert.strictEqual(result.statusCode, 410, `${routePath} 应返回 HTTP 410`);
  assert.strictEqual(result.body.status, RETIRED_STATUS, `${routePath} 应明确标记接口已退役`);
  assert.strictEqual(result.body.message, RETIRED_MESSAGE, `${routePath} 应返回明确的停用提示`);
}

async function run() {
  const failDependency = new Proxy({}, {
    get() {
      return failOnCall;
    }
  });
  const failDatabase = { query: failOnCall, withTransaction: failOnCall, getConnection: failOnCall };
  const publicationsRouter = loadRouter(
    path.resolve(__dirname, '../src/modules/scoring/routes/publications.js'),
    {
      '../../audit/models/notificationOutbox': failDependency,
      '../../../utils/dateTime': { nowMysqlUtc: failOnCall },
      '../../../utils/logger': { logger: failDependency },
      '../../../core/models/adminInfo': failDependency,
      '../models/resultPublication': failDependency,
      '../models/meritListDesignation': failDependency,
      '../models/pubGradeBand': failDependency,
      '../../../core/models/department': failDependency,
      '../../../core/models/identity': failDependency,
      '../../../core/models/workGroup': failDependency,
      '../models/scoreActivity': failDependency,
      '../../../utils/excelFile': { buildWorkbookBuffer: failOnCall },
      '../../../config/db': failDatabase,
      '../../../utils/orgContext': { getCurrentOrgId: failOnCall },
      '../utils/pubCache': failDependency,
      '../../../core/services/currentActor': { resolveCurrentActor: failOnCall },
      '../services/participants': failDependency,
      '../services/publicationAssignments': failDependency,
      '../../../core/services/dictionaryUsage': failDependency,
      '../../../core/models/unifiedIdentity': failDependency
    }
  );
  const publicationRoutes = [
    '/saveResultViewPermission',
    '/deleteResultViewPermission',
    '/saveMeritListPermission',
    '/deleteMeritListPermission'
  ];
  for (const routePath of publicationRoutes) {
    assertRetiredResponse(await invoke(publicationsRouter, routePath), routePath);
  }

  const authRouter = loadRouter(
    path.resolve(__dirname, '../src/core/routes/auth.js'),
    {
      '../../utils/dateTime': { nowMysqlUtc: failOnCall },
      '../../utils/orgContext': { getCurrentOrgId: failOnCall },
      '../models/userInfo': failDependency,
      '../models/adminInfo': failDependency,
      '../models/hrInfo': failDependency,
      '../models/organization': failDependency,
      '../../config/db': failDatabase,
      '../../middleware/orgContext': { clearOrgAccessCache: failOnCall },
      '../services/adminPermissions': { loadEffectivePermissions: failOnCall },
      '../services/accessibleOrganizations': { listAvailableOrganizations: failOnCall }
    }
  );
  assertRetiredResponse(await invoke(authRouter, '/confirmAutoBind'), '/confirmAutoBind');

  let moduleLoadFileChecks = 0;
  const auditFileRouter = loadRouter(
    path.resolve(__dirname, '../src/modules/audit/routes/auditFile.js'),
    {
      fs: {
        existsSync() {
          moduleLoadFileChecks += 1;
          return true;
        },
        mkdirSync: failOnCall,
        readFileSync: failOnCall,
        unlinkSync: failOnCall,
        createReadStream: failOnCall
      },
      '../utils/fileSecurity': {
        UPLOAD_DIR: path.resolve(__dirname),
        MAX_FILE_SIZE: 10 * 1024 * 1024,
        assertAllowedFile: failOnCall,
        createTempUpload: failOnCall,
        getAuthorizedAuditFile: failOnCall
      }
    }
  );
  assert.strictEqual(moduleLoadFileChecks, 1, '加载审核文件路由时只应检查既有上传目录');
  assertRetiredResponse(await invoke(auditFileRouter, '/mergeSignaturesIntoFile'), '/mergeSignaturesIntoFile');

  assert.strictEqual(sideEffectCalls, 0, '所有退役接口都不得访问数据库、授权文件或生成临时文件');
  console.log('遗留接口退役与无副作用契约测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
