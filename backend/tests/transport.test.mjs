import test from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { llmTransport } from '../transport.mjs';
const file=new URL('../certs/russian_trusted_root_ca.pem',import.meta.url);
test('bundled CA is the official downloaded Russian Trusted Root CA',()=>{
  const certificate=new X509Certificate(readFileSync(file));
  assert.match(certificate.subject,/Russian Trusted Root CA/);
  assert.equal(certificate.fingerprint256,'D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31');
  assert(new Date(certificate.validTo)>new Date());
});
test('configured LLM transport refuses HTTP before credentials can be sent',async()=>{
  await assert.rejects(llmTransport(file)('http://127.0.0.1:1',{headers:{Authorization:'Basic synthetic'}}),/requires HTTPS/);
});
test('without an extra CA the existing fetch transport is retained',()=>{
  assert.equal(llmTransport(null),fetch);
});
