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

      <style>
        body{
          color: #444;
          background-color: #EEE;
          margin: 40px auto;
          max-width: 650px;
          line-height: 1.6em;
          font-size: 18px;
          padding: 0;
        }
      </style>
    </head>
    <body>
      <h1>Here we will test authn.one!</h1>
      There are a few flows, and as of writing only the main one is finished.

      <h2>Regular login</h2>
      Can log in or register.

      <authn-one id="standard"></authn-one>

      <h2>Fixup</h2>
      Email is set in stone. Can register a passkey or manage existing ones (TODO management screens).

      <authn-one id="email-fixed" email="test@baillie.dev"></authn-one>

      <h2>Quick login</h2>
      Log into existing account using passkey only.

      <authn-one id="quick" quick></authn-one>

      <h2>Debug</h2>
      <button onclick="debugWithEruda()">Debug</button>

      <script>
        function debugWithEruda() {
          const script = document.createElement('script');
          script.defer = true;
          script.src = 'https://cdn.jsdelivr.net/npm/eruda';
          script.onload = () => {
            eruda.init();
          }
          document.head.append(script);
        }
      </script>
    </body>
    </html>
  HTML
end

# Automatically POSTed to by authn.one
post '/signin/:key' do
  response = Net::HTTP.post(URI("#{AUTHN_ONE}/check/#{params[:key]}"), '')
  if response.code != '200'
    puts "Bad signin! #{response.code} #{response.body}"
    return redirect to('/')
  end
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

# Email simulation for automated tests
# Same interface as mailchannels.net.
EMAILS = {} # {recipient => email[]}

post '/tx/v1/send' do
  body = JSON.parse(request.body.read, symbolize_names: true)
  case body
  in {
    personalizations: [{
      to: [{ email: to }],
    }],
    from: from,
  }
    name = to.split('@').first
    EMAILS[name] ||= []
    EMAILS[name] << body
  else
    puts 'Bad email request'
    puts JSON.pretty_generate(body)
  end

  status 204
  ''
end

# Get simulated emails by recipient (?to=x), ignores domain
get '/emails/:to' do
  headers 'Content-Type' => 'application/json',
          'Access-Control-Allow-Origin' => '*'

  emails = EMAILS[params[:to]]

  if emails.nil? || emails.empty?
    status 404
    return 'null'
  end

  JSON.pretty_generate(emails)
end