/* Bank: the ONLY interior with ATMs.  Brand colours come from the building name (First Bank, UBA, Wema …).
   The vault Bank (building_mv0q4b841p) ALSO gets the vault door (tpl_vault.js, docs/VAULT.md). */
(function (g) {
  'use strict';
  const D = g.FutaTemplates, { SEC, PATROL, CLEAN, STAFF } = D;
  const BRAND = [[/first/i, { a: '#0b2a5b', b: '#d4a62a', fg: '#ffffff' }], [/uba/i, { a: '#c1121f', b: '#f4f1ea', fg: '#ffffff' }], [/wema/i, { a: '#5b1a6b', b: '#c9a0d6', fg: '#ffffff' }], [/heritage/i, { a: '#0f6b4f', b: '#d9b24a', fg: '#ffffff' }]];
  D.def('bank', {
    title: 'Bank', icon: '🏦', w: 14, d: 10, h: 3.4, venue: 'bank', doorAt: 7, security: true,
    theme: { floor: { type: 'marble', c1: '#efe9dc', c2: '#cfc6b2' }, wall: '#f3eee2', wainscot: '#2b3a55', trim: '#d9b24a', curtain: '#8c1c3a', frame: '#f4f1ea' },
    windows: [{ wall: 'back', at: 2.4, w: 1.6 }, { wall: 'back', at: 11.6, w: 1.6 }, { wall: 'left', at: 6.5, w: 1.6 }],
    build(R, C) {
      const br = (BRAND.find(b => b[0].test(C.name)) || [0, { a: '#12332b', b: '#d9b24a', fg: '#ffffff' }])[1]; C.brand = br;
      // ONLY the vault Bank has a vault door (docs/VAULT.md). Wema, First Bank and UBA stay plain ATM banks.
      const vault = !!(g.FutaVaultDoor && g.FutaVaultDoor.isVaultBank(C)); C.vault = vault;
      R.theme.wainscot = br.a; R.theme.curtain = br.a;
      // teller line: long counter with three stations; staff stand behind it
      R.add('counter', 6.2, 3.2, 0, { w: 7, c: br.a, c2: '#f1ede4', glass: true, till: true }); R.add('tellerdesk', 3.6, 1.7, 0); R.add('tellerdesk', 6.2, 1.7, 0); R.add('tellerdesk', 8.8, 1.7, 0);
      R.add('pcdesk', 11.6, 1.5, 0, { n: 1 }); R.against('filecab', 'back', 13.0);
      R.add('queuerope', 6.2, 5.0, 0, { n: 3 });
      // ATM lobby along the right wall (the only ATMs in the game)
      R.against('atm', 'right', 3.6); R.against('atm', 'right', 5.0); R.add('queuerope', 11.9, 7.2, 90, { n: 2 }); R.against('dispenser', 'right', 6.4); R.against('noticeboard', 'right', 8.2, { w: 1.2 });
      // customer waiting area + reception
      R.add('rug', 3.4, 7.2, 0, { w: 3.4, d: 2.2, c: br.a, c2: br.b }); R.add('sofa', 2.4, 7.0, 0, { c: br.a, n: 2 }); R.add('sofa', 4.6, 7.0, 0, { c: br.a, n: 2 }); R.add('coffeetable', 3.5, 8.2, 0);
      R.add('reception', 9.2, 8.7, 180, { w: 2.2, c: br.a }); R.add('chair', 9.2, 7.7, 180, { c: br.a });
      R.add('plant', 0.5, 9.4, 0); R.add('palm', 13.4, 9.4, 0); R.add('printer', 12.0, 9.0, 180);
      R.onWall('bannerhang', 'back', 5.0, { w: 1.4, c: br.a, c2: br.b }); R.onWall('bannerhang', 'back', 9.6, { w: 1.4, c: br.a, c2: br.b }); R.onWall('wallclock', 'back', 7.4); R.onWall('wallpic', 'left', vault ? 5.0 : 2.2, { c: br.a, w: .9, h: .6 });
      R.sign(C.title.toUpperCase(), 7.0, 2.7, 0.1, 4.2, 0.55, 0, { bg: br.a, fg: br.b });
      if (vault) {                                                    // vault door on the left wall, a guard beside it (extraNpcs are added by the engine for this building only)
        R.against('vaultdoor', 'left', 3.2, { inter: ['vault'], c2: br.b }); R.sign('BANK VAULT', .06, 2.86, 3.2, 1.8, .34, 90, { bg: br.a, fg: br.b });
        C.extraNpcs = [D.SEC(1.5, 5.2, Math.PI / 2, { tag: 'vault-guard' })];
      }
      R.ceilingLights(3, 2, { color: '#fff1d0' });
    },
    npcs: [
      SEC(7.0, 8.4, 0), SEC(11.7, 4.3, 4.7, { hours: 'always', tag: 'atm-guard' }), D.PATROL([[2, 8.8], [5.5, 8.8], [5.5, 5.6], [10.5, 5.6], [10.5, 8.8]], { hours: 'work' }),
      { role: 'teller', n: 3, beh: 'post', at: [[3.6, 0.7, 0], [6.2, 0.7, 0], [8.8, 0.7, 0]], pose: 'talk', hours: 'work' },
      { role: 'staff', n: 1, beh: 'post', at: [[11.7, 0.7, 0]], pose: 'type', hours: 'work' },
      { role: 'student', n: 3, beh: 'stand', at: [[6.0, 4.4, 3.14], [7.2, 4.4, 3.14], [11.6, 3.4, 1.57]], pose: 'phone', hours: 'service' },
      { role: 'student', n: 2, beh: 'sit', sit: ['sofa'], hours: 'service' },
      CLEAN([1.5, 5.5, 12, 9], { hours: 'clean' })
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
