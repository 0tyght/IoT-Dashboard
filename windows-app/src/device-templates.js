(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeviceTemplates=value;})(globalThis,()=>{
  'use strict';
  const models=['vemsee-sn3001-wz3a-n01','pm2230','pm2200','custom'];
  const isPower=model=>model==='pm2230'||model==='pm2200';
  const fields=['registerType','registerAddress','dataType','byteOrder','frequencyByteOrder','scale','unit','offsetAdjust','points'];
  // An instance's address on the bus, identity, timing and location never enter a template.
  function snapshot(config){
    const model=config.model||config.sensorModel;
    if(!models.includes(model))throw new Error('ผัง Register ไม่รองรับ');
    const result={model};
    for(const field of fields)if(config[field]!==undefined)result[field]=JSON.parse(JSON.stringify(config[field]));
    return result;
  }
  const base={registerType:'holding',registerAddress:0,dataType:'uint16',byteOrder:'ABCD',frequencyByteOrder:'unconfirmed',scale:1,unit:''};
  const builtins=[
    {id:models[0],name:'VemSee SN-3001-WZ3A-N01',settings:{...base,model:models[0],dataType:'int16',scale:.1,unit:'mm/s'}},
    {id:'pm2230',name:'Schneider Electric PM2230',settings:{...base,model:'pm2230',byteOrder:'unconfirmed',offsetAdjust:0}},
    {id:'pm2200',name:'Schneider Electric PM2200 · ผังเดิม',settings:{...base,model:'pm2200',byteOrder:'unconfirmed',offsetAdjust:0}},
    {id:'custom',name:'กำหนด Register เอง',settings:{...base,model:'custom',points:[]}}
  ].map(item=>({...item,builtin:true}));
  return {models,isPower,snapshot,builtins};
});
