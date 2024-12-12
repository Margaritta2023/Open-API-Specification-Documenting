const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const cognito = new AWS.CognitoIdentityServiceProvider();
const docClient = new AWS.DynamoDB.DocumentClient();

const USER_POOL_ID = process.env.cup_id;
const TABLES_TABLE = 'cmtr-63edc6d2-Tables-test';
const RESERVATIONS_TABLE = 'cmtr-63edc6d2-Reservations-test';
const CLIENT_ID = process.env.cup_client_id;



const validatePassword = (password) => {
 const passwordRegex =
     /^(?=.*[A-Za-z])(?=.*\d)(?=.*[$%^*-_.])[A-Za-z\d$%^*-_.]{12,}$/;
 return passwordRegex.test(password);
};

const corsHeaders = {
 "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
 "Access-Control-Allow-Origin": "*",
 "Access-Control-Allow-Methods": "*",
 "Accept-Version": "*"
};

// Route handlers
const routeHandlers = {
 'POST /signup': async (event, context) =>
     handleSignUp(event, context, cognito),
 'POST /signin': async (event, context) =>
     handleSignIn(event, context, cognito),
 'GET /tables': async (event, context) => getTables(event, context),
 'POST /tables': async (event, context) => createTable(event, context),
 'GET /tables/{tableId}': async (event, context) =>
     getTableById(event, context),
 'GET /reservations': async (event, context) =>
     getReservations(event, context),
 'POST /reservations': async (event, context) =>
     createReservation(event, context),
};

exports.handler = async (event, context) => {
 try {
  const routeKey = `${event.httpMethod} ${event.resource}`;

  const handler =
      routeHandlers[routeKey] || routeHandlers[`GET /tables/{tableId}`];
  if (handler) {
   const response = await handler(event, context);
   return {
    ...response,
    headers: { ...response.headers, ...corsHeaders },
   };
  }

  // Fallback response if route not found
  return {
   statusCode: 404,
   headers: corsHeaders,
   body: JSON.stringify({ error: 'Route not found' }),
  };
 } catch (error) {
  console.error('Error handling request:', error);
  return {
   statusCode: 500,
   headers: corsHeaders,
   body: JSON.stringify({ error: 'Internal Server Error' }),
  };
 }
};

const initCognitoClient = () => {
 return new AWS.CognitoIdentityServiceProvider({
  region: REGION,
  credentials: AWS.config.credentials,
 });
};