const {InfluxDB} = require('@influxdata/influxdb-client');
const fs = require('fs');
const path = require('path');
const {Point} = require('@influxdata/influxdb-client');
const IPInfo = require('node-ipinfo');
const express = require('express');
require('dotenv').config();

const client = new InfluxDB({url: process.env.INFLUX_URL, token: process.env.INFLUX_TOKEN});


const writeApi = client.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET, 'ns');
writeApi.useDefaultTags({host: 'ipinfo.local'})

var app = express();
var ipinfo = new IPInfo(process.env.IPINFO_TOKEN);

function sleep(timeout = 1) {
  return new Promise((res, rej) => {
    setTimeout(res, timeout*1000);
  });
}

async function getIpInfo(ip) {
  var pathCache = path.join(__dirname, 'ipCache', `${ip}.json`);
  if(fs.existsSync(pathCache)) {
    var cInfo = require(pathCache);
    var stat = fs.statSync(pathCache);
    if(!cInfo.bogon && (new Date() - new Date(stat.atime)) / 1000 < process.env.TTL) {
      return cInfo;
    }
  }
  var info = await ipinfo.lookupIp(ip);
  fs.writeFileSync(pathCache, JSON.stringify(info, null, 2));
  return info;
}

app.get('/*', async (req, res) => {
  var ip = req.ip;
  var start = new Date();
  var point = new Point('user_request');
  point.tag('method', 'get');
  point.tag('route', req.path);
  point.timestamp(start);
  var rand = Math.round(Math.random()*10);
  await sleep(rand);
  var info = await getIpInfo(ip);
  if(info.bogon) return res.json({info});
  point.floatField('execution_time', new Date() - start);
  point.floatField('lat', info.loc.split(',')[0]);
  point.floatField('lon', info.loc.split(',')[1]);
  writeApi.writePoint(point);
  res.json({info, point});
});

app.listen(4200, '0.0.0.0');
