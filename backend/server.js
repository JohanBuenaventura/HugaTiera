require('dotenv').config()

const app = require('./app')
const { startOrphanCleanupSchedule } = require('./controllers/requestImage.controller')

const port = Number(process.env.PORT || 5000)

app.listen(port, () => {
  startOrphanCleanupSchedule()
  console.log(`HugaTiera backend listening on port ${port}`)
})
