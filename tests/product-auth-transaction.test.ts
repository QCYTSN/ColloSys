import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireAuthAttempt,
  adoptAuthAttempt,
  authAttemptBusy,
  getAuthAttempt,
  isCurrentAuthAttempt,
  releaseAuthOwner,
  transitionAuthAttempt,
  claimAuthNavigation,
} from '../integrations/codecast/web/authTransaction';

test('one authentication transaction fences rapid methods, cancellation, remounts and logout', async () => {
  let generation = 'TEST-first';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => generation },
  });
  const password = acquireAuthAttempt('password', 'form-a')!;
  assert.ok(password);
  assert.equal(acquireAuthAttempt('github', 'form-a'), null);
  assert.equal(acquireAuthAttempt('google', 'form-a'), null);
  transitionAuthAttempt(password, 'submitting');
  assert.ok(authAttemptBusy(getAuthAttempt()));
  transitionAuthAttempt(password, 'failed');
  const github = acquireAuthAttempt('github', 'form-a')!;
  transitionAuthAttempt(password, 'establishing-session');
  assert.equal(
    getAuthAttempt()?.attemptId,
    github.attemptId,
    'Late password response cannot own the newer provider attempt',
  );
  assert.equal(
    acquireAuthAttempt('github', 'form-a'),
    null,
    'Double click is locked before render',
  );
  transitionAuthAttempt(github, 'awaiting-provider');
  transitionAuthAttempt(github, 'cancelled');
  const retry = acquireAuthAttempt('google', 'form-a')!;
  assert.notEqual(retry.attemptId, github.attemptId);
  assert.equal(isCurrentAuthAttempt(github), false);
  releaseAuthOwner('form-a');
  adoptAuthAttempt('form-remounted');
  await Promise.resolve();
  assert.equal(
    isCurrentAuthAttempt(retry),
    true,
    'Verified principal remount adopts in layout effect',
  );
  generation = 'TEST-logout';
  assert.equal(isCurrentAuthAttempt(retry), false);
  transitionAuthAttempt(retry, 'establishing-session');
  assert.equal(authAttemptBusy(getAuthAttempt()), false);
  const fresh = acquireAuthAttempt('password', 'form-b')!;
  transitionAuthAttempt(fresh, 'establishing-session');
  assert.equal(claimAuthNavigation('/projects/test'), true);
  assert.equal(
    claimAuthNavigation('/projects/test'),
    false,
    'Only one verified-session navigation owner',
  );
  assert.equal(getAuthAttempt()?.phase, 'succeeded');
  transitionAuthAttempt(fresh, 'failed');
  assert.equal(
    getAuthAttempt()?.phase,
    'succeeded',
    'A late completion handler cannot reverse an already verified success',
  );
  assert.equal(
    isCurrentAuthAttempt(fresh),
    true,
    'The same successful SDK response may still finish its fenced refresh-token write',
  );
  generation = 'TEST-next';
  assert.equal(claimAuthNavigation('/projects/test'), true);
  const abandoned = acquireAuthAttempt('github', 'gone')!;
  releaseAuthOwner('gone');
  await Promise.resolve();
  assert.equal(isCurrentAuthAttempt(abandoned), false);
  delete (globalThis as any).localStorage;
});
