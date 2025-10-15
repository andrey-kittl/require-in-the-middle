'use strict'

const test = require('tape')
const { Hook, _PROCESSED_UNPATCHED_PLACEHOLDER } = require('../')

test('should cache a placeholder for unpatched modules', function (t) {
  t.plan(4)

  let onRequireCalls = 0
  const hook = new Hook(['circular'], function (exports, name, basedir) {
    onRequireCalls++
    // Do not modify exports, simulating an unpatched module
    return exports
  })

  t.on('end', function () {
    hook.unhook()
    delete require.cache[require.resolve('./node_modules/circular')]
  })

  // Action: require the module for the first time
  const circularModule = require('./node_modules/circular')
  t.equal(onRequireCalls, 1, 'onrequire hook should be called once')
  t.deepEqual(circularModule, { foo: 1 }, 'should return original exports')

  // Assertions: Check the internal cache state
  const filename = require.resolve('./node_modules/circular')
  const cachedValue = hook._cache.get(filename, false)

  t.ok(hook._cache.has(filename, false), 'cache should have an entry for the module')
  t.equal(cachedValue, _PROCESSED_UNPATCHED_PLACEHOLDER, 'cache entry for unpatched module should be the placeholder Symbol')
})

test('should not re-process unpatched modules on subsequent requires', function (t) {
  t.plan(1)

  let onRequireCalls = 0
  const hook = new Hook(['circular'], function (exports, name, basedir) {
    onRequireCalls++
    return exports
  })

  t.on('end', function () {
    hook.unhook()
    delete require.cache[require.resolve('./node_modules/circular')]
  })

  // Action: require the same module multiple times
  require('./node_modules/circular')
  require('./node_modules/circular')
  require('./node_modules/circular')

  // Assertion: The hook logic should only run on the first call
  t.equal(onRequireCalls, 1, 'onrequire hook should only be called once for unpatched modules')
})

test('should cache and return the modified exports for patched modules', function (t) {
  t.plan(4)

  const patchedValue = { patched: true }
  let onRequireCalls = 0

  const hook = new Hook(['mid-circular'], function (exports, name, basedir) {
    onRequireCalls++
    return patchedValue
  })

  t.on('end', function () {
    hook.unhook()
    delete require.cache[require.resolve('./node_modules/mid-circular')]
  })

  // Action: require the module twice
  const mod1 = require('./node_modules/mid-circular')
  const mod2 = require('./node_modules/mid-circular')

  // Assertions
  t.equal(onRequireCalls, 1, 'onrequire hook should be called only once')
  t.deepEqual(mod1, patchedValue, 'should return the patched exports on first require')
  t.deepEqual(mod2, patchedValue, 'should return the patched exports on second require')

  const filename = require.resolve('./node_modules/mid-circular')
  t.deepEqual(hook._cache.get(filename, false), patchedValue, 'internal cache should store the patched exports')
})

test('should handle re-entrant requires within the hook without recursion', function (t) {
  t.plan(2)

  let onRequireCalled = false
  const hook = new Hook(['circular'], function (exports, name, basedir) {
    // This hook is re-entrant: it requires the same module it is patching.
    // The pre-hook cache set should prevent an infinite loop.
    if (!onRequireCalled) {
      onRequireCalled = true
      const innerMod = require('./node_modules/circular')
      t.deepEqual(innerMod, { foo: 1 }, 'inner require should return original exports')
    }
    return exports
  })

  t.on('end', function () {
    hook.unhook()
    delete require.cache[require.resolve('./node_modules/circular')]
  })

  // Action: If the re-entrancy fix works, this will not crash.
  require('./node_modules/circular')
  t.pass('test completed without a stack overflow')
})

test('should cache a placeholder when exiting early for an unpatched internal module', function (t) {
  t.plan(2)

  const hook = new Hook(['internal'], { internals: false }, function (exports, name, basedir) {
    t.fail('onrequire should not be called for internal files when internals:false')
  })

  t.on('end', function () {
    hook.unhook()
    delete require.cache[require.resolve('./node_modules/internal/lib/a.js')]
  })

  // Action: require an internal file
  require('./node_modules/internal/lib/a.js')

  // Assertion: Check that the early-exit path cached the placeholder
  const filename = require.resolve('./node_modules/internal/lib/a.js')
  t.ok(hook._cache.has(filename, false), 'cache should have an entry for the internal module')
  t.equal(hook._cache.get(filename, false), _PROCESSED_UNPATCHED_PLACEHOLDER, 'cache entry should be the placeholder Symbol')
})
