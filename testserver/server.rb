require 'sinatra'
require 'sinatra/reloader'
require 'net/http'

AUTHN_ONE = 'http://localhost:8787'

# A real webserver probably already has a session store of some sort
# that's suitable for storing user sessions.
SESSIONS = {}

# Sign-in page
get '/' do
  <<-HTML
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>authn.one test server</title>

      <script type="module" src="#{AUTHN_ONE}"></script>
    </head>
    <body>
      <h1>Here we will test authn.one!</h1>

      <authn-one></authn-one>
    </body>
    </html>
  HTML
end

# Automatically POSTed to by authn.one
post '/signin/:key' do
  response = Net::HTTP.post(URI("#{AUTHN_ONE}/check/#{params[:key]}"), '')
  auth = JSON.parse(response.body)

  session_id = rand(0..99999999999).to_s
  SESSIONS[session_id] = auth

  # This handler must save session then redirect
  headers 'set-cookie' => "session=#{session_id}; path=/; same-site=strict; max-age=3600"
  redirect to('/secret')
end

# Authenticated resource
get '/secret' do
  session_id = request.cookies['session']
  session = SESSIONS[session_id]
  if !session_id || !session
    puts "Unauthorized access! #{session_id.inspect}"
    return redirect to('/')
  end

  <<-HTML
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Testing!!</title>
    </head>
    <body>
      <h1>You are authenticated</h1>

      <pre>#{JSON.pretty_generate(session)}</pre>
    </body>
    </html>
  HTML
end