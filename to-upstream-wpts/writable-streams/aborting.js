'use strict';

if (self.importScripts) {
  self.importScripts('/resources/testharness.js');
  self.importScripts('../resources/test-utils.js');
  self.importScripts('../resources/recording-streams.js');
}

const error1 = new Error('error1');
error1.name = 'error1';

promise_test(t => {
  const ws = new WritableStream({
    write() {
      return new Promise(() => { }); // forever-pending, so normally .ready would not fulfill.
    }
  });

  const writer = ws.getWriter();
  const writePromise = writer.write('a');

  const readyPromise = writer.ready;

  writer.abort(error1);

  assert_equals(writer.ready, readyPromise, 'the ready promise property should not change');

  return Promise.all([
    promise_rejects(t, new TypeError(), readyPromise, 'the ready promise should reject with a TypeError'),
    promise_rejects(t, new TypeError(), writePromise, 'the write() promise should reject with a TypeError')
  ]);
}, 'Aborting a WritableStream should cause the writer\'s unsettled ready promise to reject');

promise_test(t => {
  const ws = new WritableStream();

  const writer = ws.getWriter();
  writer.write('a');

  const readyPromise = writer.ready;

  return readyPromise.then(() => {
    writer.abort(error1);

    assert_not_equals(writer.ready, readyPromise, 'the ready promise property should change');
    return promise_rejects(t, new TypeError(), writer.ready, 'the ready promise should reject with a TypeError');
  });
}, 'Aborting a WritableStream should cause the writer\'s fulfilled ready promise to reset to a rejected one');

promise_test(t => {
  const ws = new WritableStream();
  const writer = ws.getWriter();

  writer.releaseLock();

  return promise_rejects(t, new TypeError(), writer.abort(), 'abort() should reject with a TypeError');
}, 'abort() on a released writer rejects');

promise_test(t => {
  const ws = recordingWritableStream();

  return delay(0)
    .then(() => {
      const writer = ws.getWriter();

      writer.abort();

      return Promise.all([
        promise_rejects(t, new TypeError(), writer.write(1), 'write(1) must reject with a TypeError'),
        promise_rejects(t, new TypeError(), writer.write(2), 'write(2) must reject with a TypeError')
      ]);
    })
    .then(() => {
      assert_array_equals(ws.events, ['abort', undefined]);
    });
}, 'Aborting a WritableStream immediately prevents future writes');

// https://github.com/whatwg/streams/issues/611
/*
promise_test(t => {
  const ws = recordingWritableStream();
  const results = [];

  return delay(0)
    .then(() => {
      const writer = ws.getWriter();

      results.push(
        writer.write(1),
        promise_rejects(t, new TypeError(), writer.write(2), 'write(2) must reject with a TypeError'),
        promise_rejects(t, new TypeError(), writer.write(3), 'write(3) must reject with a TypeError')
      );

      writer.abort();

      results.push(
        promise_rejects(t, new TypeError(), writer.write(4), 'write(4) must reject with a TypeError'),
        promise_rejects(t, new TypeError(), writer.write(5), 'write(5) must reject with a TypeError')
      );
    }).then(() => {
      assert_array_equals(ws.events, ['write', 1, 'abort', undefined]);

      return Promise.all(results);
    });
}, 'Aborting a WritableStream prevents further writes after any that are in progress');
*/

promise_test(() => {
  const ws = new WritableStream({
    abort() {
      return 'Hello';
    }
  });
  const writer = ws.getWriter();

  return writer.abort('a').then(value => {
    assert_equals(value, undefined, 'fulfillment value must be undefined');
  });
}, 'Fulfillment value of ws.abort() call must be undefined even if the underlying sink returns a non-undefined value');

promise_test(t => {
  const ws = new WritableStream({
    abort() {
      throw error1;
    }
  });
  const writer = ws.getWriter();

  return promise_rejects(t, error1, writer.abort(undefined),
    'rejection reason of abortPromise must be the error thrown by abort');
}, 'WritableStream if sink\'s abort throws, the promise returned by writer.abort() rejects');

promise_test(t => {
  const ws = new WritableStream({
    abort() {
      throw error1;
    }
  });

  return promise_rejects(t, error1, ws.abort(undefined),
    'rejection reason of abortPromise must be the error thrown by abort');
}, 'WritableStream if sink\'s abort throws, the promise returned by ws.abort() rejects');

test(() => {
  const ws = recordingWritableStream();
  const writer = ws.getWriter();

  writer.abort(error1);

  assert_array_equals(ws.events, ['abort', error1]);
}, 'Aborting a WritableStream passes through the given reason');

promise_test(t => {
  const ws = new WritableStream();
  const writer = ws.getWriter();

  writer.abort(error1);

  return Promise.all([
    promise_rejects(t, new TypeError(), writer.write(), 'writing should reject with a TypeError'),
    promise_rejects(t, new TypeError(), writer.close(), 'closing should reject with a TypeError'),
    promise_rejects(t, new TypeError(), writer.abort(), 'aborting should reject with a TypeError'),
    promise_rejects(t, new TypeError(), writer.closed, 'closed should reject with a TypeError')
  ]);
}, 'Aborting a WritableStream puts it in an errored state, with a TypeError as the stored error');

promise_test(t => {
  const ws = new WritableStream();
  const writer = ws.getWriter();

  const writePromise = promise_rejects(t, new TypeError(), writer.write('a'),
    'writing should reject with a TypeError');

  writer.abort(error1);

  return writePromise;
}, 'Aborting a WritableStream causes any outstanding write() promises to be rejected with a TypeError');

promise_test(t => {
  const ws = new WritableStream();
  const writer = ws.getWriter();

  const closePromise = writer.close();
  writer.abort(error1);

  return Promise.all([
    promise_rejects(t, new TypeError(), writer.closed, 'closed should reject with a TypeError'),
    promise_rejects(t, new TypeError(), closePromise, 'close() should reject with a TypeError')
  ]);
}, 'Closing but then immediately aborting a WritableStream causes the stream to error');

promise_test(t => {
  const ws = new WritableStream({
    close() {
      return new Promise(() => { }); // forever-pending
    }
  });
  const writer = ws.getWriter();

  const closePromise = writer.close();

  return delay(0).then(() => {
    writer.abort(error1);
  })
  .then(() => Promise.all([
    promise_rejects(t, new TypeError(), writer.closed, 'closed should reject with a TypeError'),
    promise_rejects(t, new TypeError(), closePromise, 'close() should reject with a TypeError')
  ]));
}, 'Closing a WritableStream and aborting it while it closes causes the stream to error');

promise_test(() => {
  const ws = new WritableStream();
  const writer = ws.getWriter();

  writer.close();

  return delay(0).then(() => writer.abort());
}, 'Aborting a WritableStream after it is closed is a no-op');

promise_test(t => {
  // Cannot use recordingWritableStream since it always has an abort
  let controller;
  let closeArgs;
  const ws = new WritableStream({
    start(c) {
      controller = c;
    },
    close(...args) {
      closeArgs = args;
    }
  });

  const writer = ws.getWriter();

  writer.abort();

  return promise_rejects(t, new TypeError(), writer.closed, 'closed should reject with a TypeError').then(() => {
    assert_array_equals(closeArgs, [controller], 'close must have been called, with the controller as its argument');
  });
}, 'WritableStream should call underlying sink\'s close if no abort is supplied');

promise_test(() => {
  let thenCalled = false;
  const ws = new WritableStream({
    abort() {
      return {
        then(onFulfilled) {
          thenCalled = true;
          onFulfilled();
        }
      };
    }
  });
  const writer = ws.getWriter();
  return writer.abort().then(() => assert_true(thenCalled, 'then() should be called'));
}, 'returning a thenable from abort() should work');

done();
