import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCpKL-4eHrqFiUntViiUB2BPs60XumC1K4",
  authDomain: "youteach-d9a79.firebaseapp.com",
  databaseURL: "https://youteach-d9a79-default-rtdb.firebaseio.com",
  projectId: "youteach-d9a79",
  storageBucket: "youteach-d9a79.firebasestorage.app",
  messagingSenderId: "302548732789",
  appId: "1:302548732789:web:b230b7f74366488d45a13c"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
