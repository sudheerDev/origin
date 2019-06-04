import '@babel/polyfill'
import express from 'express'
import cookieParser from 'cookie-parser'
import expressWs from 'express-ws'
import useragent from 'express-useragent'
import cors from 'cors'
import bodyParser from 'body-parser'
import morgan from 'morgan'
import 'express-async-errors'
import linkerRoutes from './linker-routes'
import logger from 'logger'

const app = express()
expressWs(app)
app.use(cookieParser())
app.use(morgan('combined'))
app.use(useragent.express())
app.use(cors({ origin: true, credentials: true }))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

const port = 3008
app.use('/api/wallet-linker', linkerRoutes)

app.listen(port, () => logger.info(`Linking server listening on port ${port}!`))

export default app
