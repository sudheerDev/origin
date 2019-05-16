import {extractAccountStat} from './src/utils/extract-attest'

if (process.argv.length < 3) {
  console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <accountUrl>`)
} else {
  extractAccountStat(process.argv[2]).then(result => {
    console.log("Result is:", result)
  })
}
