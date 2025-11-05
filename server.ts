const server = Bun.serve({
    port: 11000,
    routes: {
        '/': new Response(Bun.file('./public/index.html')),
        '/index.html': new Response(Bun.file('./public/index.html')),
        '/app.js': new Response(Bun.file('./public/app.js')),
        '/app.js.map': new Response(Bun.file('./public/app.js.map')),
        '/app.css': new Response(Bun.file('./public/app.css')),
        '/fonts/:font': req => {
            const pathname = new URL(req.url).pathname.split('/')[2];
            return new Response(Bun.file('./public/fonts/' + pathname));
        },
        '/images/:name': req => {
            const pathname = new URL(req.url).pathname.split('/')[2];
            return new Response(Bun.file('./public/images/' + pathname));
        },
    },
});

console.log(`listening on ${server.url}`);
