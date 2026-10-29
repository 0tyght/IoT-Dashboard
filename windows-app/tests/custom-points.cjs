'use strict';
const assert=require('node:assert/strict');const {normalizePoints}=require('../electron/custom-points.cjs');
const sample={id:'temp',name:'อุณหภูมิ',registerAddress:0,dataType:'int16',scale:.1,offset:-2,unit:'°C'};
const [point]=normalizePoints([sample]);assert.equal(point.offset,-2);assert.equal(point.registerType,'holding');assert.equal(point.record,true);
assert.throws(()=>normalizePoints([]),/1–64/);assert.throws(()=>normalizePoints([sample,{...sample,id:'TEMP'}]),/ซ้ำ/);assert.throws(()=>normalizePoints([{...sample,registerAddress:65535,dataType:'float32'}]),/Address/);assert.throws(()=>normalizePoints([{...sample,scale:0}]),/ตัวคูณ/);
assert.throws(()=>normalizePoints([{...sample,registerAddress:null}]),/Address/);assert.throws(()=>normalizePoints([{...sample,offset:null}]),/ตัวคูณ/);
console.log('PASS: independent custom register point validation and explicit recording settings');
