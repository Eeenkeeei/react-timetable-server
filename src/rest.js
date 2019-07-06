const restify = require('restify');
const {BadRequestError, NotFoundError, InvalidCredentialsError, UnauthorizedError} = require('restify-errors');
const MongoClient = require("mongodb").MongoClient;
const rjwt = require('restify-jwt-community');
const jwt = require('jsonwebtoken');
const config = require('./config');
const user = require('./user');
const watershed = require('watershed');
const server = restify.createServer({handleUpgrades: true});
const ws = new watershed.Watershed();
const bcrypt = require('bcryptjs');

server.use(restify.plugins.bodyParser());
server.use(restify.plugins.queryParser());

server.use(rjwt(config.jwt).unless({
    path: ['/testlog', '/removeNews', '/getNewsList', '/auth', '/addNews', '/confirmAdminPassword', '/addAnswer', '/getSupportList', '/registration', '/updateData', '/websocket/attach', '/timetableUpdate', '/sync', '/changePassword'],
}));

const url = "mongodb://eeenkeeei:shiftr123@ds347707.mlab.com:47707/heroku_ww8906l5";
const mongoClient = new MongoClient(url, {useNewUrlParser: true});

let collection;
let news;

let log;

mongoClient.connect(function (err, client) {
    const db = client.db("heroku_hw9cvg3q");
    collection = db.collection("users");
    news = db.collection("news");
    log = db.collection("log");
});



server.pre((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // * - разрешаем всем
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { // Preflight
        res.send();
        next(false);
        return;
    }
    next();
});


server.get('/getSupportList', (req, res, next) => {
    collection.find().toArray(function (err, results) {
        res.send(results);
        next();
    });
});

server.get('/getNewsList', (req, res, next) => {
    news.find().toArray(function (err, results) {
        res.send(results);
        next();
    });
});

server.post('/removeNews', (req, res, next) => {
    console.log(req.body.id);
    news.deleteOne({text: req.body.text}, function (err, result) {

    });
});

server.post('/testlog', (req, res, next) => {
    console.log(req.body);
    let object = {
        string: req.body,
        date: new Date()
    };
    log.insertOne(object, function (err, result) {
        console.log('Добавлено в log');
        res.send('added');
        if (err) {
            return console.log(err);
        }
    });
});

server.post('/addNews', (req, res, next) => {
    console.log(req.body);
    let object = {
        header: req.body.header,
        author: req.body.author,
        text: req.body.body
    };

    news.insertOne(object, function (err, result) {
        console.log('Добавлено');
        res.send('added');
        if (err) {
            return console.log(err);
        }
    });
});


server.post('/confirmAdminPassword', (req, res, next) => {
    console.log('confirm', req.body);
    const password = 'shiftr123';
    if (req.body.password === password) {
        res.send('confirm')
    } else {
        res.send('not confirm')
    }
    next();
});

server.post('/addAnswer', (req, res, next) => {
    console.log(req.body);
    collection.find({username: req.body.username}).toArray(function (err, result) {
        let supportArray = result[0].support;
        for (const question of supportArray) {
            if (question.theme === req.body.theme && question.question === req.body.question) {
                supportArray[supportArray.indexOf(question)].status = req.body.status;
                collection.updateOne({username: req.body.username}, {$set: {support: supportArray}});
                console.log('Answer added');
                return;
            }
        }
    });
    res.send('updated');
    next()
});


server.get('/user', (req, res, next) => {
    console.log('GET USER');
    console.log(req.user.username, req.user.password);
    const decodedObject = jwt.verify(req.headers.authorization.split(' ')[1], config.jwt.secret);
    console.log(decodedObject);
    user.returnUpdatedObject(decodedObject.username, decodedObject.password).then((data, e) => {
        try {
            // console.log('data', data);
            if (data === null) {
                res.send('Null');
            }
            // console.log(data)
            res.send(data);
            next()
        } catch (e) {
            return next(new InvalidCredentialsError());
        }
    });
});

server.post('/auth', (req, res, next) => {
    let {username, password} = req.body;
    console.log(username, password);
    user.authenticate(username, password).then((data, e) => {
        try {
            // console.log(data);
            if (data === null) {
                return next(new InvalidCredentialsError());
                // res.send('Null');
            }
            let token = jwt.sign(data, config.jwt.secret, {
                expiresIn: '1d'
            });

            let {iat, exp} = jwt.decode(token);
            console.log('token', token);
            res.send({iat, exp, token});
            next()
        } catch (e) {
            return next(new InvalidCredentialsError());

        }
    });
});

let resultFlag = '';

server.post('/timetableUpdate', (req, res, next) => {
    console.log('UPDATE DATA');
    let userData = req.body;
    console.log(userData);

// todo: валидация
    mongoClient.connect(function (err, client) {
        const db = client.db("heroku_hw9cvg3q");
        const collection = db.collection("users");
        collection.replaceOne({username: userData.username}, {
            username: req.body.username,
            password: req.body.password,
            email: req.body.email,
            edu: req.body.edu,
            gender: req.body.gender,
            age: req.body.age,
            timetable: req.body.timetable,
            readLater: req.body.readLater,
            tasks: req.body.tasks,
            notes: req.body.notes,
            lessonsTimetable: req.body.lessonsTimetable,
            startPage: req.body.startPage,
            support: req.body.support,
            lecturers: req.body.lecturers,
            noteTags: req.body.noteTags
        });
        resultFlag = 'Timetable Updated';
        console.log(resultFlag);
        res.send(resultFlag);
    });
    next();
});

server.post('/changePassword', (req, res, next) => {
    console.log('CHANGE PASSWORD');
    let userData = req.body;
    let oldPassword = req.body.oldPassword;
    let newPassword = req.body.newPassword;
    let confirmNewPassword = req.body.confirmNewPassword;
    if (newPassword.length < 7) {
        console.log('Длина пароля меньше 8');
        res.send('Bad password length');
        next();
        return;
    }
    if (newPassword !== confirmNewPassword) {
        console.log('Пароли не совпадают');
        res.send('Bad confirm');
        next();
        return;
    }
    mongoClient.connect(async function (err, client) {
        const db = client.db("heroku_hw9cvg3q");
        const collection = db.collection("users");
        collection.find({username: req.body.username}).toArray(function (err, result) {
            if (result.length !== 0) {
                userData = result[0];
                if (bcrypt.compareSync(newPassword, userData.password) === true) {
                    console.log('Старый и новый пароль совпадает');
                    res.send('Passwords matches');
                    next();
                    return;
                }
                if (bcrypt.compareSync(oldPassword, userData.password) === true) {
                    console.log('Пароль обновлен');
                    let newData = {
                        username: userData.username,
                        password: confirmNewPassword
                    };
                    collection.updateOne({username: userData.username}, {$set: {password: bcrypt.hashSync(confirmNewPassword, 10)}});
                    // console.log(newData);
                    res.send('Updated');
                    return;
                }
                if (bcrypt.compareSync(oldPassword, userData.password) === false) {
                    console.log('Старый пароль не совпадает');
                    res.send('Not confirmed');
                    return;
                }
            }
        });
    });
    next();
});

server.post('/updateData', (req, res, next) => {
    console.log('UPDATE DATA');
    let userData = req.body;
    console.log(userData);
    if (isNaN(req.body.age) === true) {
        console.log('В возрасте не число');
        resultFlag = 'Bad Request(age)';
        res.send(resultFlag);
        next();
        return;
    }

    mongoClient.connect(function (err, client) {
        const db = client.db("heroku_hw9cvg3q");
        const collection = db.collection("users");
        collection.replaceOne({username: userData.username}, {
            username: req.body.username,
            password: req.body.password,
            email: req.body.email,
            edu: req.body.edu,
            gender: req.body.gender,
            age: req.body.age,
            timetable: req.body.timetable,
            readLater: req.body.readLater,
            tasks: req.body.tasks,
            notes: req.body.notes,
            lessonsTimetable: req.body.lessonsTimetable,
            startPage: req.body.startPage,
            support: req.body.support,
            lecturers: req.body.lecturers,
            noteTags: req.body.noteTags
        });
        resultFlag = 'Data updated';
        console.log(resultFlag);
        res.send(resultFlag);
    });
    next();
});

let timetable = [];
server.post('/registration', (req, res, next) => {
    console.log('РЕГИСТРАЦИЯ');
    // console.log(req.body);
    let hashedPassword = bcrypt.hashSync(req.body.password, 10);
    let user = {
            username: req.body.nickname, password: hashedPassword, edu: req.body.edu,
            email: req.body.email, gender: req.body.gender, age: req.body.age,
            timetable,
            readLater: [{linkName: "name", linkTag: "tags", link: "link", done: "done"}],
            tasks: [],
            notes: [],
            noteTags: [
                {
                    tagText: 'Важное',
                    tagClass: 'danger'
                },
                {
                    tagText: 'Среднее',
                    tagClass: 'warning'
                },
                {
                    tagText: 'Не срочно',
                    tagClass: 'success'
                }
            ],
            lessonsTimetable: [
                {
                    start: '8:00',
                    end: '9:30',
                    number: 'first'
                },
                {
                    start: '9:40',
                    end: '11:10',
                    number: 'second'
                },
                {
                    start: '11:20',
                    end: '12:50',
                    number: 'third'
                },
                {
                    start: '13:30',
                    end: '15:00',
                    number: 'fourth'
                },
                {
                    start: '15:10',
                    end: '16:40',
                    number: 'fifth'
                },
                {
                    start: '16:50',
                    end: '18:20',
                    number: 'sixth'
                }
            ],
            startPage: 'account.html',
            support: [],
            lecturers: []
        }
    ;

    if (req.body.password !== req.body.passwordConfirm) {
        console.log('Пароли не совпадают');
        resultFlag = 'Bad Password';
        res.send(resultFlag);
        next();
        return;
    }

    if (isNaN(req.body.age) === true) {
        console.log('В возрасте не число');
        resultFlag = 'Bad Request(age)';
        res.send(resultFlag);
        next();
        return;
    }

    if (user.username.length < 4 || user.password.length < 7) {
        console.log('Не удовл. условиям');
        resultFlag = 'Bad Request';
        res.send(resultFlag);
        next();
        return;
    }

    mongoClient.connect(function (err, client) {
        const db = client.db("heroku_hw9cvg3q");
        const collection = db.collection("users");
        collection.find({username: req.body.nickname}).toArray(function (err, result) {
            if (result.length === 0) {
                resultFlag = 'true';
                console.log('Копий нет');
                collection.insertOne(user, function (err, result) {
                    console.log('Добавлено');
                    if (err) {
                        return console.log(err);
                    }
                });
                res.send(resultFlag);

            } else {
                resultFlag = 'false';
                console.log(resultFlag);
                console.log('Есть копия, не добавлено');
                res.send(resultFlag);

                if (err) {
                    return console.log(err);
                }
            }
        });
    });
    next();
});

const port = process.env.PORT || 7777;
let acceptedUsername;

// server.get('/updateData', (req, res, next) => {
//     if (!res.claimUpgrade) {
//         next(new Error('Connection Must Upgrade For WebSockets'));
//         return;
//     }
//     const upgrade = res.claimUpgrade();
//     const shed = ws.accept(req, upgrade.socket, upgrade.head);
//
//     shed.on('text', function (msg) {
//         acceptedUsername = msg;
//         console.log('User: ' + msg);
//         const response = {
//             username: acceptedUsername,
//             msg: "Update"
//         };
//         shed.send(JSON.stringify(response));
//     });
//
//     next(false);
// });
//
// server.get('/sync', (req, res, next) => {
//     if (!res.claimUpgrade) {
//         next(new Error('Connection Must Upgrade For WebSockets'));
//         return;
//     }
//     const upgrade = res.claimUpgrade();
//     const shed = ws.accept(req, upgrade.socket, upgrade.head);
//
//     const response = {
//         username: acceptedUsername,
//         msg: "Update"
//     };
//     shed.send(JSON.stringify(response));
//     next(false);
// });


server.listen(port, () => {
    console.log('server started');

});


// todo:
//
// const clients = new Set();
//
// server.get('/', (req, res, next) => {
//     res.send('hello world');
// });
//
// server.get('/ws', (req, res, next) => {
//     if (!res.claimUpgrade) {
//         next(new Error('Connection Must Upgrade For WebSockets'));
//         return;
//     }
//     const upgrade = res.claimUpgrade();
//     const shed = ws.accept(req, upgrade.socket, upgrade.head);
//
//     console.log('client connected');
//
//     clients.add(shed);
//     shed.on('text', () => {
//         console.log('client send something');
//     });
//
//     shed.on('end', () => {
//         console.log('client disconnected');
//         clients.delete(shed);
//         console.log(clients.size);
//     });
//
//     next(false);
// });
//
// setInterval(() => {
//     for (const client of clients) {
//         client.send(`clients count: ${clients.size}`);
//     }
// }, 5000);
//
// const port = process.env.PORT || 7777;
// server.listen(port, () => {
//     console.log('server started');
// });

