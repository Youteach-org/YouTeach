import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0MGu1Izo7-u6IVya50S3hirWjCwT4_44",
  authDomain: "team-assigner-9a2e2.firebaseapp.com",
  databaseURL: "https://team-assigner-9a2e2-default-rtdb.firebaseio.com",
  projectId: "team-assigner-9a2e2",
  storageBucket: "team-assigner-9a2e2.firebasestorage.app",
  messagingSenderId: "844601603838",
  appId: "1:844601603838:web:f230a81e218b8e631d57af"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db };
