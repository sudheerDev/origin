# Linking Server

Communicates with [Origin mobile wallet app](https://github.com/OriginProtocol/origin/tree/master/mobile). It receieves messages from the [Linker Client](https://github.com/OriginProtocol/origin/tree/master/packages/linker-client) concerning web3 transactions to be completed in the wallet. It can also push messagse to the phone where the app is installed. 

Messages sent via Firebase.

- `sendNotify`, pushes a notfication to the app. 

Wallet notification messages include:

- `Confirm your listing for ${meta.listing.title}`
- `Confirm your offer for ${meta.listing.title}`
- `Confirm the rejection of an offer for ${meta.listing.title}`
- `Confirm the withdrawal of an offer for ${meta.listing.title}`
- `Confirm the acceptance of an offer for ${meta.listing.title}`
- `Confirm your reporting of a problem ${meta.listing.title}`
- `Confirm the release of funds for ${meta.listing.title}`
- `Confirm your review from selling ${meta.listing.title}`
- `${meta.method} pending for ${meta.listing.title}`
- `Confirm the publishing of your identity`
- `Pending call to ${meta.contract}.${meta.method}`
- `There is a pending call for your approval`

# To get linker running in local mode

To get Linker running in local mode for the support of YuCam you need to have the following services running. (use either docker or run them on host):
- services
- postgres
- redis

Make sure origin-js is built: 
`npm run build --prefix packages/origin-js`

Migrate db if necessary: 
`DATABASE_URL=postgres://origin:origin@localhost/origin npm run migrate`

In case an already existing migration has been modified undo the migration before applying it again: 
`DATABASE_URL=postgres://origin:origin@localhost/origin npm run undo-migrate`

Run linker with the necessary environmental variables
`REDIS_URL=redis://localhost:6379 PROVIDER_URL=http://localhost:8545 ATTESTATION_ACCOUNT=0x99C03fBb0C995ff1160133A8bd210D0E77bCD101 HOT_WALLET_PK=C87509A1C067BBDE78BEB793E6FA76530B6382A4C0241E5E4A9EC0A0F44DC0D3 DATABASE_URL=postgres://origin:origin@localhost/origin npm run start`


