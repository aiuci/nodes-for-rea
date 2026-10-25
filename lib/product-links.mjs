// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Renderer requests a known link key; only these owner-selected destinations
// may be opened by the trusted desktop host.
export const PRODUCT_LINKS=Object.freeze({
 coffee:'https://gorgeous.systems/coffee',
 coolnew:'https://coolnew.tech/',
 gorgeous:'https://gorgeous.systems/',
 aiuci:'https://aiuci.com/'
});
export function productLink(key){
 if(typeof key!=='string'||!Object.hasOwn(PRODUCT_LINKS,key))throw Error('Unknown product link.');
 return PRODUCT_LINKS[key];
}
