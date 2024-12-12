const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();
const { v4: uuidv4 } = require('uuid');

const TABLE_TABLE = process.env.table_table;
const RESERVATION_TABLE = process.env.reservation_table;
const CUP_ID = process.env.cup_id;
const CUP_CLIENT_ID = process.env.cup_client_id;
const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "*",
  "Accept-Version": "*"
};

exports.handler = async (event) => {
  const {httpMethod, path} = event;

  try {
    switch (true) {
      case path === '/signup' && httpMethod === 'POST':
        return handleSignup(event);

      case path === '/signin' && httpMethod === 'POST':
        return handleSignin(event);

      case path === '/tables' && httpMethod === 'GET':
        return handleGetTables(event);

      case path === '/tables' && httpMethod === 'POST':
        return handleCreateTable(event);

      case /^\/tables\/\d+$/.test(path) && httpMethod === 'GET':
        return handleGetTableById(event);

      case path === '/reservations' && httpMethod === 'POST':
        return handleCreateReservation(event);

      case path === '/reservations' && httpMethod === 'GET':
        return handleGetReservations(event);

      default:
        throw new Error('Bad Request');
    }
  } catch (error) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};

const handleSignup = async (event) => {
  const { firstName, lastName, email, password } = JSON.parse(event.body);

  const createUserParams = {
    UserPoolId: CUP_ID,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: `${firstName} ${lastName}` }
    ],
    MessageAction: 'SUPPRESS',
    TemporaryPassword: password
  };

  try {
    await cognito.adminCreateUser(createUserParams).promise();

    const setPasswordParams = {
      UserPoolId: CUP_ID,
      Username: email,
      Password: password,
      Permanent: true
    };

    await cognito.adminSetUserPassword(setPasswordParams).promise();

    console.log("cognito:", cognito);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'User created successfully with a permanent password' })
    };
  } catch (error) {
    console.error('Signup error:', error);
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};

const handleSignin = async (event) => {
  const { email, password } = JSON.parse(event.body);

  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CUP_CLIENT_ID,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password
    }
  };

  try {
    const authResult = await cognito.initiateAuth(params).promise();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ accessToken: authResult.AuthenticationResult.IdToken })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};

const handleGetTables = async () => {
  const params = {
    TableName: TABLE_TABLE
  };

  try {
    const data = await dynamoDb.scan(params).promise();
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ tables: data.Items })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};

const handleCreateTable = async (event) => {
  const { id, number, places, isVip, minOrder } = JSON.parse(event.body);

  const params = {
    TableName: TABLE_TABLE,
    Item: {
      id: id,
      number,
      places,
      isVip,
      minOrder
    }
  };

  try {
    await dynamoDb.put(params).promise();
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ id })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};

const handleGetTableById = async (event) => {
  const tableId = parseInt(event.pathParameters.tableId, 10);

  const params = {
    TableName: TABLE_TABLE,
    Key: {
      id: tableId
    }
  };

  try {
    const data = await dynamoDb.get(params).promise();
    if (!data.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Table not found' })
      };
    }
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(data.Item)
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};

const handleCreateReservation = async (event) => {
  const { tableNumber, clientName, phoneNumber, date, slotTimeStart, slotTimeEnd } = JSON.parse(event.body);

  const tableExistsParams = {
    TableName: TABLE_TABLE,
    FilterExpression: "#num = :tableNumber",
    ExpressionAttributeNames: {
      "#num": "number", 
    },
    ExpressionAttributeValues: {
      ":tableNumber": tableNumber,
    },
  };

  try {
    const tableExistsResult = await dynamoDb.scan(tableExistsParams).promise();
    console.log("Table Exists Result:", JSON.stringify(tableExistsResult));

    if (tableExistsResult.Items.length === 0) {
      console.log("Table does not exist");
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Table does not exist' })
      };
    }

    const paramsCheck = {
      TableName: RESERVATION_TABLE,
      FilterExpression: '#tableNumber = :tableNumber AND #date = :date AND ((#slotTimeStart < :slotTimeEnd AND #slotTimeEnd > :slotTimeStart) OR (#slotTimeStart < :slotTimeEnd AND #slotTimeEnd > :slotTimeStart))',
      ExpressionAttributeNames: {
        '#tableNumber': 'tableNumber',
        '#date': 'date',
        '#slotTimeStart': 'slotTimeStart',
        '#slotTimeEnd': 'slotTimeEnd'
      },
      ExpressionAttributeValues: {
        ':tableNumber': tableNumber,
        ':date': date,
        ':slotTimeStart': slotTimeStart,
        ':slotTimeEnd': slotTimeEnd
      }
    };

    const existingReservations = await dynamoDb.scan(paramsCheck).promise();
    console.log("Existing Reservations Result:", JSON.stringify(existingReservations));

    if (existingReservations.Items.length > 0) {
      console.log("Reservation overlaps with an existing reservation");
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Reservation overlaps with an existing reservation' })
      };
    }

    const reservationId = uuidv4();

    const params = {
      TableName: RESERVATION_TABLE,
      Item: {
        id: reservationId,
        tableNumber,
        clientName,
        phoneNumber,
        date,
        slotTimeStart,
        slotTimeEnd
      }
    };

    await dynamoDb.put(params).promise();
    console.log("Reservation created successfully");
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ reservationId })
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};


const handleGetReservations = async () => {
  const params = {
    TableName: RESERVATION_TABLE
  };

  try {
    const data = await dynamoDb.scan(params).promise();
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ reservations: data.Items })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};