const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mime = require('mime-types');

const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const token = "Bearer *!/0?;&okyE[)G4z;Zi},~VkS#~JO0QR";
const username = "Xyz0004@#MinorAntakaSuraDevil!";
const password = "<s+_3uE`]Bo}*|.&q$rfd\"!(l>|_0lUL";

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: true
}));

function checkToken(request) {
  if(!request.headers["authorization"]) {
      return false;
  } else if(request.headers["authorization"] != token) {
    return false;
  } else {
    return true;
  }
}

const myId = 'SingleDeviceX';

const authStrategy = new LocalAuth({
  clientId: myId,
  // dataPath: storage.sessionPath, // don't use dataPath to keep it default to ./wwwjs_auth
});

const worker = `${authStrategy.dataPath}/session-${myId}/Default/Service Worker`
if (fs.existsSync(worker)) {
  fs.rmSync(worker, { recursive: true })
}

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
  },
  takeoverOnConflict: true,
  takeoverTimeoutMs: 10,
  authStrategy
});

client.on('message', msg => {
  if (msg.body == '!ping') {
    msg.reply('pong');
  } else if (msg.body == 'test') {
    msg.reply('Whatsapp api is work');
  } else if (msg.body == '!groups') {
    client.getChats().then(chats => {
      const groups = chats.filter(chat => chat.isGroup);

      if (groups.length == 0) {
        msg.reply('You have no group yet.');
      } else {
        let replyMsg = '*YOUR GROUPS*\n\n';
        groups.forEach((group, i) => {
          replyMsg += `ID: ${group.id._serialized}\nName: ${group.name}\n\n`;
        });
        replyMsg += '_You can use the group id to send a message to the group._'
        msg.reply(replyMsg);
      }
    });
  }
// media download
  // if (msg.hasMedia) {
  //   msg.downloadMedia().then(media => {
  //     // To better understanding
  //     // Please look at the console what data we get
  //     console.log(media);
  //
  //     if (media) {
  //       // The folder to store: change as you want!
  //       // Create if not exists
  //       const mediaPath = './downloaded-media/';
  //
  //       if (!fs.existsSync(mediaPath)) {
  //         fs.mkdirSync(mediaPath);
  //       }
  //
  //       // Get the file extension by mime-type
  //       const extension = mime.extension(media.mimetype);
  //
  //       // Filename: change as you want!
  //       // I will use the time for this example
  //       // Why not use media.filename? Because the value is not certain exists
  //       const filename = new Date().getTime();
  //
  //       const fullFilename = mediaPath + filename + '.' + extension;
  //
  //       // Save to file
  //       try {
  //         fs.writeFileSync(fullFilename, media.data, { encoding: 'base64' });
  //         console.log('File downloaded successfully!', fullFilename);
  //       } catch (err) {
  //         console.log('Failed to save the file:', err);
  //       }
  //     }
  //   });
  // }
});

client.initialize();

// Socket IO
io.on('connection', function(socket) {
  socket.emit('message', 'Connecting...');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });

  client.on('authenticated', () => {
    socket.emit('authenticated', 'Whatsapp is authenticated!');
    socket.emit('message', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED');
  });

  client.on('auth_failure', function(session) {
    socket.emit('message', 'Auth failure, restarting...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp is disconnected!');
    client.destroy();
    client.initialize();
  });
});


const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

// index html
app.get('/', (req, res) => {
  res.sendFile('login.html', {
    root: __dirname
  });
});

app.post('/app', (req, res) => {
  if(req.body.username == username && req.body.password == password) {
    res.sendFile('index.html', {
      root: __dirname
    });
  } else {
    let string = "Login gagal";
    res.redirect('/?message=' + string);
  }
});


// Send message
app.post('/send-message', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  var status = checkToken(req);
  if (status == false) {
    return res.status(422).json({
      status: false,
      message:"Token is wrong or empty"
    });
  }
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Send media
app.post('/send-media', (req, res) => {

  var status = checkToken(req);
  if (status == false) {
    return res.status(422).json({
      status: false,
      message:"Token is wrong or empty"
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const file = req.files.file;
  const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);

  client.sendMessage(number, media, {caption: caption}).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// sending media from url
app.post('/send-media-url', async (req, res) => {

  var status = checkToken(req);
  if (status == false) {
    return res.status(422).json({
      status: false,
      message:"Token is wrong or empty"
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file_url;
  let mimetype;
  const attachment = await axios.get(fileUrl, {responseType: "arraybuffer"})
      .then(response => {
          mimetype = response.headers['content-type'];
          return response.data.toString('base64');
      });

  const media = new MessageMedia(mimetype, attachment, "Media");

  client.sendMessage(number, media, {caption: caption}).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

server.listen(port, function() {
  console.log('App running on *: ' + port);
});
