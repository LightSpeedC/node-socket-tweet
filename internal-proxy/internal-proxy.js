// internal-proxy.js

void function () {
	'use strict';

	var assert = require('assert');
	var path = require('path');
	var net = require('net');
	//var log = require('log-manager').setWriter(new require('log-writer')('internal-proxy-%s.log')).getLogger();
	var log = require('log-manager').getLogger();
	var zlib = require('zlib');
	var TransformXor = require('../lib/transform-xor');
	var zz = require('../lib/zip-unzip');

	log.info('node', process.version, path.basename(__filename));
	process.title = path.basename(__filename);

	if (!process.env.APP_DUMP_URL)     throw new Error('APP_DUMP_URL');
	if (!process.env.APP_PROXY_METHOD) throw new Error('APP_PROXY_METHOD');
	if (!process.env.APP_PROXY_URL)    throw new Error('APP_PROXY_URL');
	if (!process.env.APP_XOR1)         throw new Error('APP_XOR1');
	if (!process.env.APP_XOR2)         throw new Error('APP_XOR2');

	try { var configs = require('./local-internal-proxy-config'); }
	catch (e) { var configs = require('./internal-proxy-config'); }

	log.setLevel(configs.logLevel);
	log.info(configs);
	for (var i of Object.keys(process.env).filter(s => s.startsWith('APP_')).sort())
		console.log('\x1b[42m' + 'env: ' + i + ' \t= ' + process.env[i] + '\x1b[m');
	console.log();

	var forwarderId = 20000;
	var myName = '(internal-proxy)';

	configs.forwarders.forEach(function (config) {
		assert(Number(config.forwarderPort), 'config.forwarderPort');
		assert(Number(config.servicePort),   'config.servicePort');

		log.info(config);

		var serviceNetSvr = net.createServer(
				{allowHalfOpen:true},
				function connectionService(c) {
			log.debug(myName, 'connected.');
			var s = net.connect(
					{port:config.forwarderPort, host:config.forwarderHost, allowHalfOpen:true},
					function connectionForwarder() {
				s.write(process.env.APP_PROXY_METHOD + ' ' +
						process.env.APP_PROXY_URL + ' HTTP/1.1\r\nHost: ' +
						configs.proxyHost + ':' + configs.proxyPort +
						'\r\n\r\n');

				s.on('readable', function readable() {
					var buff = s.read();
					if (!buff) return;

					s.removeListener('readable', readable);

					var lines = buff.toString().split('\n');
					var words = lines[0].trim().split(' ');

					log.info(words);

					if (!words[0].startsWith('HTTP/1.') ||
							words[1] !== '200' ||
							words[2] !== 'OK') {
						c.write(buff);
						s.pipe(c);
						c.pipe(s);
						return;
					}

					var x1 = new TransformXor(Number(process.env.APP_XOR1));
					var x2 = new TransformXor(Number(process.env.APP_XOR2));
					var x3 = new TransformXor(Number(process.env.APP_XOR2));
					var x4 = new TransformXor(Number(process.env.APP_XOR1));

					c.pipe(x1);
					zz.zip(x1, x2);
					x2.pipe(s);

					s.pipe(x3);
					zz.unzip(x3, x4);
					x4.pipe(c);

				});

			});
			s.on('error', function error(err) {
				log.warn(myName, 'forwarder error', err);
				s.destroy();
			});
			s.on('end', function end() {
				log.debug(myName, 'forwarder disconnected');
			});

			var received = false;
			c.on('error', function error(err) {
				log.warn(myName, 'client error', err);
				c.destroy();
			});
			c.on('end', function end() {
				log.debug(myName, 'client disconnected');
				if (!received) {
					log.warn(myName, 'client has gone!');
				}
			});

		}).listen(config.servicePort, function listeningService() {
			log.info(myName, 'server bound. port', config.servicePort);
		});

	}); // configs.forEach

}();
