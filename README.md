# authn.one

Webauthn is really great, but not super easy to implement. This is a service that makes it dead simple.

What's the catch? Well, you have to trust us! That's why the project is open source. More eyeballs, etc. Additionally, you can self host.

## Dev

```bash
# Get your code here.
git clone https://github.com/Resonious/authn.one.git
cd auth.one
npm install

# The frontend is built as a separate esbuild bundle.
node ./build.mjs &

# The backend is Cloudflare Workers.
npm run dev
```
