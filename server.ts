const server = Bun.serve({
    development: true,
    port: 11000,
    routes: {
        '/': () => new Response(Bun.file('./public/index.html')),
        '/index.html': () => new Response(Bun.file('./public/index.html')),
        '/app.js': () => new Response(Bun.file('./public/app.js')),
        '/app.js.map': () => new Response(Bun.file('./public/app.js.map')),
        '/app.css': () => new Response(Bun.file('./public/app.css')),
        '/:dir/*': req => {
            const { dir } = req.params;
            const allowed: Record<string, 1> = { assets: 1, images: 1, fonts: 1 };
            if (!allowed[dir]) {
                throw new Error('404');
            }

            const pathname = new URL(req.url).pathname.split('/').slice(2).join('/');
            return new Response(Bun.file(`./public/${dir}/` + pathname));
        },
    },
});

console.log(`listening on ${server.url}`);
