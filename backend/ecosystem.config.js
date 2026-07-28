const path = require('path');

module.exports = {
  apps: [
    {
      name: 'aliyun-platform-backend',
      script: 'app.py',
      interpreter: 'python3',
      cwd: path.join(__dirname),
      env: {
        PORT: 5001
      },
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
