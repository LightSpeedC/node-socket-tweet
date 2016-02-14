(function () {
	'use strict';

	var http = require('http');
	var net = require('net');
	var url = require('url');
	var log = require('log-manager').getLogger();
	var zlib = require('zlib');
	var log = require('log-manager').getLogger();
	var TransformXor = require('../lib/transform-xor');

	var PORT = process.env.PORT || 3000;
	if (!process.env.APP_DUMP_URL) throw new Error('APP_DUMP_URL');
	if (!process.env.APP_PROXY_METHOD) throw new Error('APP_PROXY_METHOD');
	if (!process.env.APP_PROXY_URL) throw new Error('APP_PROXY_URL');
	if (!process.env.APP_XOR1) throw new Error('APP_XOR1');
	if (!process.env.APP_XOR2) throw new Error('APP_XOR2');

	log.setLevel('trace');

	for (var i of Object.keys(process.env).filter(s => s.startsWith('APP_')).sort())
		console.log('\x1b[42m' + 'env: ' + i + ' \t= ' + process.env[i] + '\x1b[m');
	console.log();

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
			function connectionMain(s) {
		log.trace('(main) connected');
		var c;
		s.on('error', function error(err) {
			log.warn('(main) client error:', err);
			if (c) c.destroy();
			s.destroy();
		});
		s.on('readable', function readable() {
			var buff = s.read();
			if (!buff) return;

			s.removeListener('readable', readable);

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

				str += 'node-socket-tweet by LightSpeedC (2016-02-14 09:06)\n';

				var ret = new Buffer(str);
				s.write('HTTP/1.1 200 OK\r\n' +
					'Content-Type: text/plain\r\n' +
					'Content-Length: ' + ret.length + '\r\n' +
					'\r\n');
				s.end(ret);
				return;
			}

			if (words[0] !== process.env.APP_PROXY_METHOD ||
				words[1] !== process.env.APP_PROXY_URL ||
				!words[2].startsWith('HTTP/1.')) {
				s.write('HTTP/1.1 404 Not Found\r\n' +
					'Content-Type: text/plain\r\n' +
					'Content-Length: 3\r\n' +
					'\r\nerr');
				s.end();
				return;
			}

			s.write('HTTP/1.1 200 OK\r\n' +
				'Content-Type: text/plain\r\n' +
				'Content-Length: 1\r\n' +
				'\r\n1');

			var c = net.connect(
					{port:httpPort, host:'localhost', allowHalfOpen:true},
					function connection() {
				log.trace('(main) http connected');
			});
			c.on('error', function error(err) {
				log.warn('(main) server error:', err);
				c.destroy();
				s.destroy();
			});

			var x1 = new TransformXor(Number(process.env.APP_XOR1));
			var x2 = new TransformXor(Number(process.env.APP_XOR2));
			var x3 = new TransformXor(Number(process.env.APP_XOR2));
			var x4 = new TransformXor(Number(process.env.APP_XOR1));

			var gz = zlib.createGzip();
			var uz = zlib.createUnzip();

			gz.on('error', function (err) {
				log.warn('gz error', err);
				c.destroy();
				s.destroy();
			});

			uz.on('error', function (err) {
				log.warn('uz error', err);
				c.destroy();
				s.destroy();
			});

			c.pipe(x1).pipe(gz).pipe(x2).pipe(s);
			s.pipe(x3).pipe(uz).pipe(x4).pipe(c);

		});
	}).on('error', function error(err) {
		log.warn('(main) server error:', err);
	}).listen(PORT, function listening() {
		log.info('(main) port %s server started', serverMain.address().port);
	});

	var serverHttp = http.createServer(function (req1, res1) {
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
			res2.pipe(res1);
			res2.on('error', function error(err) {
				log.warn('(http) res2', err);
				req1.connection.destroy();
				req2.connection.destroy();
			});
		});
		req1.on('error', function error(err) {
			log.warn('(http) req1', err);
			req1.connection.destroy();
			req2.connection.destroy();
		});
		res1.on('error', function error(err) {
			log.warn('(http) res1', err);
			req1.connection.destroy();
			req2.connection.destroy();
		});
		req2.on('error', function error(err) {
			log.warn('(http) req2', err);
			req1.connection.destroy();
			req2.connection.destroy();
		});
		req1.pipe(req2);

	}).on('error', function error(err) {
		log.warn('(http) server error:', err);
	});

	serverHttp.listen(function () {
		httpPort = serverHttp.address().port;
		log.info('(http) port %s server started', httpPort);
	});

	serverHttp.on('connect', function connect(req, c, head) {
		var x = url.parse('https://' + req.url);
		var host = x.hostname, port = x.port || 443;
		log.info('https connect:', req.url);

		var s = net.connect(port, host, function connect() {
			c.write('HTTP/1.0 200 Connection established\r\n\r\n');
		});

		c.on('error', function error(err) {
			log.warn('(https) connect client error:', err);
			s.destroy();
			c.destroy();
		});

		s.on('error', function error(err) {
			log.warn('(https) connect server error:', err);
			s.destroy();
			c.destroy();
		});

		if (head && head.length) c.write(head);
		s.pipe(c);
		c.pipe(s);

	});

})();
