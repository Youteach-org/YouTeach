import { db } from "./firebase.js";
import {
  ref,
  get,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const loadBtn = document.getElementById("load");
const idInput = document.getElementById("id");
const nameOutput = document.getElementById("name");
const pointsOutput = document.getElementById("points");

function showStudent(student) {
  nameOutput.innerText = student.name || "";
  pointsOutput.innerText = `Puntos: ${student.points ?? 0} | Equipo: ${student.team || "Sin equipo"}`;
}

async function loadStudent() {
  const id = idInput.value.trim().toUpperCase();

  if (!id) {
    alert("Escribe tu ID.");
    return;
  }

  try {
    const snapshot = await get(ref(db, "students"));
    const students = snapshot.val();

    if (!students) {
      alert("No hay alumnos registrados.");
      return;
    }

    let foundKey = null;
    let foundStudent = null;

    for (const [key, student] of Object.entries(students)) {
      if ((student.id || "").toUpperCase() === id) {
        foundKey = key;
        foundStudent = student;
        break;
      }
    }

    if (!foundKey) {
      alert("No se encontró un alumno con ese ID.");
      return;
    }

    showStudent(foundStudent);

    onValue(ref(db, `students/${foundKey}`), (studentSnapshot) => {
      const student = studentSnapshot.val();
      if (student) {
        showStudent(student);
      }
    });
  } catch (error) {
    console.error(error);
    alert("No se pudo cargar el alumno.");
  }
}

loadBtn.addEventListener("click", loadStudent);
