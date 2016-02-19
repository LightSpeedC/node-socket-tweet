(function () {
	'use strict';

	var http = require('http');
	var net = require('net');
	var url = require('url');
	var log = require('log-manager').getLogger();
	var zlib = require('zlib');
	var log = require('log-manager').getLogger();
	var TransformXor = require('../lib/transform-xor');
	var zz = require('../lib/zip-unzip');

	var PORT = process.env.PORT || 3000;
	if (!process.env.APP_DUMP_URL)     throw new Error('APP_DUMP_URL');
	if (!process.env.APP_PROXY_METHOD) throw new Error('APP_PROXY_METHOD');
	if (!process.env.APP_PROXY_URL)    throw new Error('APP_PROXY_URL');
	if (!process.env.APP_XOR1)         throw new Error('APP_XOR1');
	if (!process.env.APP_XOR2)         throw new Error('APP_XOR2');

	log.setLevel('trace');

	for (var i of Object.keys(process.env).filter(s => s.startsWith('APP_')).sort())
		console.log('\x1b[42m' + 'env: ' + i + ' \t= ' + process.env[i] + '\x1b[m');
	console.log();
	log.info(require('os').networkInterfaces());

	var headers = {'Content-Type': 'text/html; charset=UTF-8',
		'Cahche-Control': 'private, no-store, no-cache, must-revalidate',
		'Pragma': 'no-cache',
		'Expires': 'Thu, 01 Dec 1994 16:00:00 GMT'};

	function httpDate(d) {
		var s = d + '';
		return s.slice(0, 3)+ ', ' + s.slice(8, 10) + ' ' + s.slice(4, 7) + ' ' + s.slice(11, 24) + ' GMT';
	}

	var httpPort;

	var serverMain = net.createServer({allowHalfOpen:true},
			function connectionMain(c) {
		var startTime = Date.now() / 1000;
		log.trace('(main) connected:',
			[c.localAddress, c.localPort, c.remoteAddress, c.remotePort]);
		var s;
		c.on('end', function () {
			log.trace('(main) disconnected:', (Date.now() / 1000 - startTime).toFixed(3), 'sec');
		});
		c.on('error', function error(err) {
			log.warn('(main) client error:', err);
			if (s) s.destroy();
			c.destroy();
		});
		c.on('readable', function readable() {
			var buff = c.read();
			if (!buff) return;

			c.removeListener('readable', readable);

			var lines = buff.toString().split('\n');
			var words = lines[0].trim().split(' ');

			if (words[0] === 'GET' &&
				words[1] === process.env.APP_DUMP_URL &&
				words[2].startsWith('HTTP/1.')) {

				var str = '';
				str += 'req.method: ' + words[0] + '\n';
				str += 'req.url: ' + words[1] + '\n\n';

				for (var i in lines)
					if (lines[i].trim())
						str += 'lines[' + i + '] \t= ' + lines[i].trim() + '\n';
				str += '\n';

				for (var i in process.argv)
					str += 'process.argv[' + i + '] \t= ' + process.argv[i] + '\n';
				str += '\n';

				str += 'process.version \t= ' + process.version + '\n\n';

				for (var i in process.versions)
					str += 'process.versions.' + i + ' \t= ' + process.versions[i] + '\n';
				str += '\n';

				for (var i of Object.keys(process.env).sort())
					str += 'process.env.' + i + ' \t= ' + process.env[i] + '\n';
				str += '\n';

				str += 'node-socket-tweet by LightSpeedC (2016-02-19 00:10)\n';

				var ret = new Buffer(str);
				c.write('HTTP/1.1 200 OK\r\n' +
					'Content-Type: text/plain\r\n' +
					'Content-Length: ' + ret.length + '\r\n' +
					'\r\n');
				c.end(ret);
				return;
			}

			if (words[0] !== process.env.APP_PROXY_METHOD ||
				words[1] !== process.env.APP_PROXY_URL ||
				!words[2].startsWith('HTTP/1.')) {
				c.write('HTTP/1.1 404 Not Found\r\n' +
					'Content-Type: text/plain\r\n' +
					'Content-Length: 3\r\n' +
					'\r\nerr');
				c.end();
				log.debug('eh!?', buff.toString());
				return;
			}

			c.write('HTTP/1.1 200 OK\r\n' +
				'Content-Type: text/plain\r\n' +
				'Content-Length: 1\r\n' +
				'\r\n1');

			var s = net.connect(
					{port:httpPort, host:'::1', allowHalfOpen:true},
					function connection() {
				log.trace('(conn) connected:',
					[s.localAddress, s.localPort, s.remoteAddress, s.remotePort]);
				var startTime = Date.now() / 1000;
				s.on('end', function () {
					log.trace('(conn) disconnected:', (Date.now() / 1000 - startTime).toFixed(3), 'sec');
				});
			});
			s.on('error', makeError('(main) server error:', s, c));
			c.pipe(s);
			s.pipe(c);

/*
			var x1 = new TransformXor(Number(process.env.APP_XOR1));
			var x2 = new TransformXor(Number(process.env.APP_XOR2));
			var x3 = new TransformXor(Number(process.env.APP_XOR2));
			var x4 = new TransformXor(Number(process.env.APP_XOR1));

			c.pipe(x3);
			zz.unzip(x3, x4);
			x4.pipe(s);

			s.pipe(x1);
			zz.zip(x1, x2);
			x2.pipe(c);
*/

		});
	}).on('error', function error(err) {
		log.warn('(main) server error:', err);
	}).listen(PORT, function listeningServer() {
		log.info('(main) server started:',
			serverMain.address());
	});

	var serverHttp = http.createServer(function connectionHttp(req1, res1) {
		var startTime = Date.now() / 1000;
		var c = req1.connection;
		log.trace('(http) connected:',
			[c.localAddress, c.localPort, c.remoteAddress, c.remotePort]);
		c.on('end', function () {
			log.trace('(http) disconnected:', (Date.now() / 1000 - startTime).toFixed(3), 'sec');
		});
		console.log('\x1b[44mreq: ' + req1.method + ' ' + req1.url + ' (' +
			req1.headers.host + ')\x1b[m');

		var headers = {};
		for (var i in req1.headers) headers[i] = req1.headers[i];
		delete headers['proxy-connection'];
		if (req1.headers['proxy-connection'])
			headers['connection'] = req1.headers['proxy-connection'];

		var x = url.parse(req1.url);

		var options = {
			method: req1.method,
			host: x.hostname,
			port: x.port || 80,
			//agent:soc1.$agent,
			path: req1.url,
			headers: headers};

		var req2 = http.request(options, function response(res2) {
			res1.writeHead(res2.statusCode, res2.statusMessage, res2.headers);
			res2.on('error', makeError('(http) res2:', req1.connection, req2.connection));
			res2.pipe(res1);
		});

		req1.on('error', makeError('(http) req1:', req1.connection, req2.connection));
		res1.on('error', makeError('(http) res1:', req1.connection, req2.connection));
		req2.on('error', makeError('(http) req2:', req1.connection, req2.connection));
		req1.pipe(req2);

	}).on('error', function error(err) {
		log.warn('(http) server error:', err);
	});

	serverHttp.listen(function listeningHttp() {
		httpPort = serverHttp.address().port;
		log.info('(http) server started:', serverHttp.address());
	});

	serverHttp.on('connect', function connectHttp(req, c, head) {
		var x = url.parse('https://' + req.url);
		var host = x.hostname, port = x.port || 443;
		log.info('https connect:', req.url);

		var s = net.connect(port, host, function connect() {
			c.write('HTTP/1.0 200 Connection established\r\n\r\n');
			if (head && head.length) s.write(head);
		});

		c.on('error', makeError('(https) connect client error:', s, c));
		s.on('error', makeError('(https) connect server error:', s, c));

		s.pipe(c);
		c.pipe(s);

	});

	function makeError(msg, s, c) {
		return function error(err) {
			log.warn(msg, err);
			s.destroy();
			c.destroy();
		}
	}

})();
