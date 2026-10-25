import test from 'node:test';
import assert from 'node:assert/strict';
import {PRODUCT_LINKS,productLink} from '../lib/product-links.mjs';
test('footer only opens owner-selected destinations, including corrected aiuci domain',()=>{
 assert.deepEqual(PRODUCT_LINKS,{coffee:'https://gorgeous.systems/coffee',coolnew:'https://coolnew.tech/',gorgeous:'https://gorgeous.systems/',aiuci:'https://aiuci.com/'});
 for(const key of Object.keys(PRODUCT_LINKS))assert.equal(productLink(key),PRODUCT_LINKS[key]);
 for(const key of ['https://example.com','file:///C:/Windows','iuc','__proto__','constructor',null,{}])assert.throws(()=>productLink(key),/Unknown product link/);
});
