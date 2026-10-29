'use strict';
function applyBus(device,buses){const match=buses.find(bus=>bus.path.toUpperCase()===String(device.path||'').toUpperCase());return match?{...device,baudRate:match.baudRate,parity:match.parity,stopBits:match.stopBits}:device;}
function applyGroupBuses(group,buses){return {...group,meters:group.meters.map(meter=>applyBus(meter,buses))};}
module.exports={applyBus,applyGroupBuses};
