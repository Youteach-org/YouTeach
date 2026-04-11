import { db } from "./firebase.js";
import {
  ref,
  push,
  set,
  get,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { generateId } from "./app.js";

const createStudentBtn = document.getElementById("createStudent");
const createTeamsBtn = document.getElementById("createTeams");
const studentNameInput = document.getElementById("studentName");
const numTeamsInput = document.getElementById("numTeams");
const teamsList = document.getElementById("teamsList");
const studentsList = document.getElementById("studentsList");

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderTeams(teams) {
  if (!teams || Object.keys(teams).length === 0) {
    teamsList.innerHTML = "<p>No hay equipos generados todavía.</p>";
    return;
  }

  teamsList.innerHTML = Object.entries(teams).map(([teamKey, members]) => {
    const membersHtml = Array.isArray(members) && members.length > 0
      ? members.map((member) => `<li>${member}</li>`).join("")
      : "<li>Sin integrantes</li>";

    return `
      <div style="border:1px solid #ccc; border-radius:10px; padding:12px; margin-bottom:12px; background:#fff;">
        <h3 style="margin-top:0;">${teamKey.replace("team", "Equipo ")}</h3>
        <ul style="margin:0; padding-left:20px;">${membersHtml}</ul>
      </div>
    `;
  }).join("");
}

function renderStudents(students) {
  if (!students || Object.keys(students).length === 0) {
    studentsList.innerHTML = "<p>No hay alumnos registrados todavía.</p>";
    return;
  }

  studentsList.innerHTML = Object.entries(students).map(([, student]) => {
    return `
      <div style="border:1px solid #ccc; border-radius:10px; padding:12px; margin-bottom:12px; background:#fff;">
        <strong>${student.name}</strong><br>
        ID: ${student.id}<br>
        Puntos: ${student.points ?? 0}<br>
        Equipo: ${student.team || "Sin equipo"}
      </div>
    `;
  }).join("");
}

async function createStudent() {
  const name = studentNameInput.value.trim();

  if (!name) {
    alert("Escribe el nombre del alumno.");
    return;
  }

  try {
    await set(push(ref(db, "students")), {
      name,
      id: generateId(),
      points: 0,
      team: null
    });

    studentNameInput.value = "";
    alert("Alumno creado.");
  } catch (error) {
    console.error(error);
    alert("No se pudo crear el alumno.");
  }
}

async function createTeams() {
  const numTeams = Number(numTeamsInput.value);

  if (!numTeams || numTeams < 2) {
    alert("Escribe un número válido de equipos.");
    return;
  }

  try {
    const snapshot = await get(ref(db, "students"));
    const students = snapshot.val();

    if (!students || Object.keys(students).length === 0) {
      alert("No hay alumnos registrados.");
      return;
    }

    const studentEntries = shuffleArray(Object.entries(students));
    const teams = {};

    for (let i = 1; i <= numTeams; i += 1) {
      teams[`team${i}`] = [];
    }

    let index = 0;

    for (const [studentKey, student] of studentEntries) {
      const teamNumber = (index % numTeams) + 1;
      const teamName = `Equipo ${teamNumber}`;

      teams[`team${teamNumber}`].push(student.name);

      await update(ref(db, `students/${studentKey}`), {
        team: teamName
      });

      index += 1;
    }

    await set(ref(db, "currentTeams"), teams);
    alert("Equipos generados.");
  } catch (error) {
    console.error(error);
    alert("No se pudieron generar los equipos.");
  }
}

createStudentBtn.addEventListener("click", createStudent);
createTeamsBtn.addEventListener("click", createTeams);

onValue(ref(db, "students"), (snapshot) => {
  renderStudents(snapshot.val() || {});
});

onValue(ref(db, "currentTeams"), (snapshot) => {
  renderTeams(snapshot.val() || {});
});
