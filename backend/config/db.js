const { MongoClient } = require('mongodb');

const ConnectDB = async () => { 
    try {
        const client = new MongoClient(process.env.MONGODB_ATLAS_URI); //moved inside
        await client.connect();

        console.log("Connected to MongoDB Atlas");
    } catch (error) {
        console.error("Database connection error:", error);
    }
}

module.exports = ConnectDB;