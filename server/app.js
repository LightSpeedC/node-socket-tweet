(function () {
	'use strict';

	var http = require('http');
	var PORT = process.env.PORT || 3000;

	var headers = {'Content-Type': 'text/html; charset=UTF-8',
		'Cahche-Control': 'private, no-store, no-cache, must-revalidate',
		'Pragma': 'no-cache',
		'Expires': 'Thu, 01 Dec 1994 16:00:00 GMT'};

	function httpDate(d) {
		var s = d + '';
		return s.slice(0, 3)+ ', ' + s.slice(8, 10) + ' ' + s.slice(4, 7) + ' ' + s.slice(11, 24) + ' GMT';
	}

	var server = http.createServer(function (req, res) {
		for (var i in headers)
			res.setHeader(i, headers[i]);
		res.setHeader('Last-Modified', httpDate(new Date()));
		console.log('test console.log コンソール');
		console.error('test console.error コンソール');
		console.log('\x1b[42mtest console.log コンソール\x1b[m');
		console.error('\x1b[41mtest console.error コンソール\x1b[m');
		res.writeHead(200, {'Content-Type': 'text/plain'});
		for (var i in process.argv)
			res.write('process.argv[' + i + '] \t= ' + process.argv[i] + '\n');
		res.write('\n');
		res.write('process.version \t= ' + process.version + '\n');
		res.write('\n');
		for (var i in process.versions)
			res.write('process.versions.' + i + ' \t= ' + process.versions[i] + '\n');
		res.write('\n');
		for (var i in process.env)
			res.write('process.env.' + i + ' \t= ' + process.env[i] + '\n');
		res.write('\n');
		res.end('node-socket-tweet 2016-02-13 by LightSpeed');
	});

	server.listen(PORT, function () {
		console.log('port %s server started', PORT);
	});

})();
