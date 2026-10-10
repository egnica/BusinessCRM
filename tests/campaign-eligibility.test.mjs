import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignBlockedReason, getBlockedCampaignContacts } from '../lib/campaignEligibility.mjs';

test('legacy defaults and normalized subscribed statuses remain eligible', () => {
  for (const emailStatus of [undefined, null, '', 'subscribed', ' Subscribed ', 'unknown', ' Unknown ']) {
    assert.equal(campaignBlockedReason({email:' person@example.com ',emailStatus}), '');
  }
});

test('blocked recipients get actionable reasons without permitting unsubscribed contacts', () => {
  for (const emailStatus of ['unsubscribed', ' Unsubscribed ']) {
    assert.match(campaignBlockedReason({email:'person@example.com',emailStatus}), /Unsubscribed/);
  }
  assert.match(campaignBlockedReason({email:'person@example.com',emailStatus:'bounced'}), /bounced/);
  assert.match(campaignBlockedReason({email:'person@example.com',emailStatus:'complained'}), /complained/);
  for (const email of ['', ' ', null, 123]) assert.match(campaignBlockedReason({email}), /Missing/);
  for (const email of ['bad','a@b','a b@example.com','a@example.com,b@example.com']) {
    assert.match(campaignBlockedReason({email}), /Invalid/);
  }
});

test('selected failures include names, addresses, and missing records only', () => {
  const blocked = getBlockedCampaignContacts(['1','2','3'], [
    {_id:'1',firstName:'Valid',email:'valid@example.com',emailStatus:'unknown'},
    {_id:'2',firstName:'Blocked',lastName:'Person',email:'blocked@example.com',emailStatus:'unsubscribed'},
    {_id:'4',email:'unselected@example.com',emailStatus:'unsubscribed'},
  ]);
  assert.deepEqual(blocked.map(({id})=>id), ['2','3']);
  assert.equal(blocked[0].name,'Blocked Person');
  assert.equal(blocked[0].email,'blocked@example.com');
  assert.equal(blocked[0].exists,true);
  assert.equal(blocked[1].exists,false);
  assert.match(blocked[1].reason,/no longer exists/);
});
