# authn.one

Webauthn is really great, but not super easy to implement. [authn.one](https://authn.one) is a service that makes it dead simple.

```html
<script type="module" src="https://authn.one"></script>
<authn-one></authn-one>
```

This will give you a simple login/register box where users can log in or register.

On your server, you must respond to `POST /signin/{token}`. When a token comes in, POST it back to authn.one to make sure it's real. If it belongs to a user who successfully authenticated, you'll get back a JSON object with a unique user ID and email address. We'll also tell you the origin at which they authenticated, so you can make sure it's the same origin as your own.

```ruby
# server example
post '/signin/:token' do
  # This POST request consumes the token. Additional requests with the same token will fail.
  response = Net::HTTP.post(URI("https://authn.one/check/#{params[:token]}"), '')

  # If the token is valid, you'll get back a JSON object like this:
  # {
  #   "authenticated": true,
  #   "user": "11111-some-unique-id",
  #   "email": "test@example.com",
  #   "origin": "https://example.com"
  # }
  auth = JSON.parse(response.body)
  raise 'not authenticated' unless auth['authenticated']

  # It's a good idea to check the origin to make sure nobody is tricking you.
  raise 'invalid auth' if auth['origin'] != 'https://example.com'

  # Now you can safely log in your user. How you maintain your session is up to you.
  session_id = rand(0..99999999999).to_s
  SESSIONS[session_id] = auth
  headers 'set-cookie' => "session=#{session_id}; path=/; same-site=strict; max-age=3600"
  redirect to('/secret')
end
```

# Contributing

```bash
# Get your code here.
git clone https://github.com/Resonious/authn.one.git
cd auth.one
npm install

# The frontend is built as an esbuild bundle.
node ./build.mjs --watch &

# The backend is Cloudflare Workers.
npm run dev
```
