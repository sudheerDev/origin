import extractAttest from './src/utils/extract-attest'

if (process.argv.length < 4) {
  console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <attestUrl> <referralUrl>`)
} else {
  extractAttest(process.argv[2], process.argv[3]).then(result => {
    console.log("Result is:", result)
  })
}
