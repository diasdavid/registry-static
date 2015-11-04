/*
Copyright (c) 2014, Yahoo! Inc. All rights reserved.
Code licensed under the BSD License.
See LICENSE file.
*/
var fs = require('graceful-fs')
var path = require('path')
var options = require('./args')
var async = require('async')
// var url = require('url')
var log = require('davlog')
var timethat = require('timethat').calc
var util = require('./util')

// kill the info logging on check
// only warn and err should be printed.
log.quiet()

var check = function (dir, callback) {
  var json = path.join(options.dir, dir, 'index.json')
  fs.readFile(json, 'utf8', function (err, data) {
    /* istanbul ignore next just an error callback */
    if (err) { return callback() }
    var o = JSON.parse(data)
    util.check(o, options, callback)
  })
}
exports.check = check

/* istanbul ignore next we know process.exit works */
var exit = function () {
  process.exit(1)
}
exports.exit = exit

var run = function () {
  fs.readdir(options.dir, function (err, dirs) {
    if (err) {
      return console.log(err)
    }
    var start = new Date()
    async.eachLimit(dirs, options.limit, check, function () {
      console.log('finished checking tarballs in', timethat(start))
      if (options.report) {
        var report = require('./verify.js').report()
        console.log('writing report to', options.report)
        fs.writeFile(options.report, JSON.stringify(report, null, 4) + '\n', 'utf8', exports.exit)
      } else {
        exports.exit()
      }
    })
  })
}
exports.run = run
