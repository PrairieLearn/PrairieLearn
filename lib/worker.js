process.on('message', (m) => {
    console.log(`child ${process.pid} got message`, m);
    process.send({id: m.id, err: null, args: {}});
});
