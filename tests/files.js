/* globals describe, before, after, it */

var assert = require('assert')
var mockery = require('mockery')

var testError = new Error()
var memblob = require('abstract-blob-store')()
function noop () {
  return ''
}
var files

describe('files', function () {
  before(function (done) {
    mockery.registerMock('./verify.js', {
      verify: function (obj, callback) {
        obj.verified = true
        if (obj.makeError) {
          callback(testError)
        } else {
          callback()
        }
      }
    })
    mockery.registerMock('./args.js', {
      dir: __dirname,
      limit: 2,
      blobstore: memblob
    })
    mockery.registerMock('./hooks', {
      afterTarball: function (info, callback, callback2) {
        info.afterTarballCalled = true
        info.callbacksEqual = callback === callback2
        callback()
      },
      tarball: function (info, callback, success) {
        info.tarballCalled = true
        info.tarballPathCorrect = info.tarball === info.path
        success()
      },
      indexJson: function (info, callback, success) {
        info.indexJsonCalled = true
        if (info.makeError) {
          callback(testError)
        } else {
          success()
        }
      },
      versionJson: function (info, callback, success) {
        info.versionJsonCalled = true
        success()
      }
    })
    mockery.registerMock('mkdirp', function (dir, callback) {
      callback()
    })
    mockery.registerMock('davlog', {
      init: noop,
      info: noop,
      warn: noop
    })
    mockery.enable({
      useCleanCache: true,
      warnOnReplace: false,
      warnOnUnregistered: false
    })
    files = require('../lib/files')
    done()
  })

  after(function (done) {
    mockery.disable()
    mockery.deregisterAll()
    done()
  })

  it('should export an object with methods', function (done) {
    assert.equal(typeof files, 'object')
    ;['saveJSON', 'saveTarballs'].forEach(function (name) {
      assert.equal(typeof files[name], 'function')
    })
    done()
  })

  describe('saveTarballs', function () {
    var tarballs
    before(function (done) {
      tarballs = [
        {
          path: 'foopath0.tgz'
        },
        {
          path: 'foopath1.tgz'
        }
      ]
      // var callback = this.callback
      files.saveTarballs(tarballs, done)
    })

    it('sets tarball property', function (done) {
      assert.equal(tarballs[0].tarball, 'foopath0.tgz')
      assert.equal(tarballs[1].tarball, 'foopath1.tgz')
      done()
    })
    it('tarball hook called, with correct tarball path', function (done) {
      assert(tarballs[0].tarballCalled)
      assert(tarballs[0].tarballPathCorrect)
      assert(tarballs[1].tarballCalled)
      assert(tarballs[1].tarballPathCorrect)
      done()
    })
    it('afterTarball hook called, with to of the same callback', function (done) {
      assert(tarballs[0].afterTarballCalled)
      assert(tarballs[0].callbacksEqual)
      assert(tarballs[1].afterTarballCalled)
      assert(tarballs[1].callbacksEqual)
      done()
    })
    it('early exit should call back with an error', function (done) {
      tarballs = [
        {
          path: 'foopath0.tgz',
          makeError: true
        }
      ]
      files.saveTarballs(tarballs, function (err) {
        assert.strictEqual(err, testError)
        done()
      })
    })
  })

  describe('saveJSON', function () {
    var info
    before(function (done) {
      info = {
        json: {name: 'foopackage'},
        seq: 97,
        latestSeq: 42,
        versions: [
          {
            json: {name: 'foopackage'},
            version: '1.0.0'
          },
          {
            json: {name: 'foopackage'},
            version: '2.0.0'
          }
        ]
      }
      files.saveJSON(info, done)
    })

    it('saves 3 json files', function (done) {
      assert.deepEqual(memblob.data, {
        'foopackage/index.json': '{\n    "name": "foopackage"\n}\n',
        'foopackage/1.0.0/index.json': '{\n    "name": "foopackage"\n}\n',
        'foopackage/2.0.0/index.json': '{\n    "name": "foopackage"\n}\n'
      })
      done()
    })

    it('indexJson hook called', function (done) {
      assert(info.indexJsonCalled)
      done()
    })

    it('versionJson hook called', function (done) {
      assert(info.versions[0].versionJsonCalled)
      assert(info.versions[1].versionJsonCalled)
      done()
    })

    it('early exit (no top level name): no hooks called, no files saved', function (done) {
      memblob.data = {}
      var info = {
        json: {}
      }
      files.saveJSON(info, function () {
        assert.deepEqual(memblob.data, {})
        assert(!info.indexJsonCalled)
        done()
      })
    })

    it('early exit (error): no hooks called, no files saved, err returned', function (done) {
      memblob.data = {}
      var info = {
        json: {
          name: 'foo',
          error: 'anError'
        }
      }
      files.saveJSON(info, function (err) {
        assert.deepEqual(memblob.data, {})
        assert(!info.indexJsonCalled)
        assert.equal(err, 'anError')
        done()
      })
    })

    it('early exit (putAllParts): err returned', function (done) {
      memblob.data = {}
      var info = {
        json: {name: 'foopackage'},
        makeError: true
      }
      files.saveJSON(info, function (err) {
        assert.deepEqual(memblob.data, [])
        assert(info.indexJsonCalled)
        assert.equal(err, testError)
        done()
      })
    })

    it('early exit (putPart): returned in putAllParts, indexJson written', function (done) {
      memblob.data = {}
      var info = {
        json: {name: 'foopackage'},
        versions: [
          {}
        ]
      }
      files.saveJSON(info, function () {
        assert.deepEqual(memblob.data, {'foopackage/index.json': '{\n    "name": "foopackage"\n}\n'})
        assert(info.indexJsonCalled)
        // no actual error here to test
        done()
      })
    })

    it('early exit (no versions): returned before putAllParts, indexJson written', function (done) {
      memblob.data = {}
      var info = {
        json: {name: 'foopackage'}
      }
      files.saveJSON(info, function () {
        assert.deepEqual(memblob.data, {'foopackage/index.json': '{\n    "name": "foopackage"\n}\n'})
        assert(info.indexJsonCalled)
        // no actual error here to test
        done()
      })
    })
  })
})
