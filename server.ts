const indexHtml = Bun.file('./public/index.html');
const appJs = Bun.file('./public/app.js');

const server = Bun.serve({
    port: 11000,
    routes: {
        '/': new Response(indexHtml),
        '/index.html': new Response(indexHtml),
        '/app.js': new Response(appJs),
    },
});

console.log(`listening on ${server.url}`);
