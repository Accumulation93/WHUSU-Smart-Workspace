'use strict';

// 评分接口与评分导出没有查看学号的例外，管理员级别也不扩大这一范围。
function isStudentIdKey(key) {
  const normalized=String(key).toLowerCase().replace(/[^a-z]/g,'');
  return /(?:studentid|studentnumber|studentno)(?:hash|digest|masked)?$/.test(normalized);
}

function removeStudentIds(value, seen=new WeakMap()) {
  if(!value || typeof value!=='object' || value instanceof Date)return value;
  if(seen.has(value))return seen.get(value);
  const result=Array.isArray(value)?[]:{};
  seen.set(value,result);
  for(const [key,item] of Object.entries(value)){
    if(isStudentIdKey(key))continue;
    Object.defineProperty(result,key,{value:removeStudentIds(item,seen),enumerable:true,writable:true,configurable:true});
  }
  return result;
}

function respondScoringResponse(res,body) {
  return res.json(removeStudentIds(body));
}

function publicScoringHeaders(headers) {
  return headers.filter(header=>!isStudentIdKey(header.key));
}

module.exports={isStudentIdKey,removeStudentIds,respondScoringResponse,publicScoringHeaders};
