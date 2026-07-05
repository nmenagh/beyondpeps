(function () {
  function initPeptideCalculator() {
    const root = document.querySelector("#peptide-calc");
    if (!root) return;

    const state = { syringeUnits: 100 };
    const barrelTop = 58;
    const barrelBottom = 345;
    const barrelHeight = barrelBottom - barrelTop;
    const tickRight = 80.5;
    const largeWidth = 17;
    const smallWidth = 9;
    const labelX = 88;

    const fields = {
      vial: root.querySelector("#vial-mg"),
      bac: root.querySelector("#bac-water"),
      dosage: root.querySelector("#dosage"),
      unit: root.querySelector("#dosage-unit"),
      frequency: root.querySelector("#dose-frequency"),
      cycle: root.querySelector("#cycle-weeks"),
      concentration: root.querySelector("#pc-concentration"),
      dosageMl: root.querySelector("#pc-dosage-ml"),
      dosageUnits: root.querySelector("#pc-dosage-units"),
      dosesPerVial: root.querySelector("#pc-doses-per-vial"),
      weeksVial: root.querySelector("#pc-weeks-vial"),
      vialsNeeded: root.querySelector("#pc-vials-needed"),
      bacNeeded: root.querySelector("#pc-bac-needed"),
      fillRect: root.querySelector("#fill-rect"),
      tickGroup: root.querySelector("#tick-group"),
      syringeUnitDisplay: root.querySelector("#syringe-unit-display")
    };

    function unitToY(units, maxUnits) {
      return barrelBottom - (units / maxUnits) * barrelHeight;
    }

    function drawTicks(maxUnits) {
      fields.tickGroup.innerHTML = "";

      for (let units = 10; units <= maxUnits; units += 10) {
        const y = unitToY(units, maxUnits);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", tickRight - largeWidth);
        line.setAttribute("x2", tickRight);
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.classList.add("syringe-tick-major");
        fields.tickGroup.appendChild(line);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", labelX);
        text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "start");
        text.classList.add("syringe-tick-label");
        text.textContent = units;
        fields.tickGroup.appendChild(text);
      }

      for (let units = 5; units < maxUnits; units += 10) {
        const y = unitToY(units, maxUnits);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", tickRight - smallWidth);
        line.setAttribute("x2", tickRight);
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.classList.add("syringe-tick-minor");
        fields.tickGroup.appendChild(line);
      }
    }

    function updateFill(fillUnits) {
      const clamped = Math.max(0, Math.min(fillUnits, state.syringeUnits));
      const height = (clamped / state.syringeUnits) * barrelHeight;
      fields.fillRect.setAttribute("y", barrelBottom - height);
      fields.fillRect.setAttribute("height", height);
    }

    function calculate() {
      const vialMg = Number.parseFloat(fields.vial.value) || 0;
      const bacMl = Number.parseFloat(fields.bac.value) || 0;
      const dosageRaw = Number.parseFloat(fields.dosage.value) || 0;
      const cycleWeeks = Number.parseFloat(fields.cycle.value) || 0;
      const frequency = Number.parseFloat(fields.frequency.value) || 7;

      const concentration = bacMl > 0 ? vialMg / bacMl : 0;
      const doseMg = fields.unit.value === "mcg" ? dosageRaw / 1000 : dosageRaw;
      const doseMl = concentration > 0 ? doseMg / concentration : 0;
      const doseUnits = doseMl * 100;
      const dosesPerVial = doseMg > 0 ? vialMg / doseMg : 0;
      const weeks = doseMg > 0 ? dosesPerVial / frequency : Infinity;

      fields.concentration.textContent = `${concentration.toFixed(2)} mg/mL`;
      fields.dosageMl.textContent = `${doseMl.toFixed(3)} mL`;
      fields.dosageUnits.textContent = doseUnits.toFixed(1);
      fields.dosesPerVial.textContent = Number.isFinite(dosesPerVial) && dosesPerVial > 0 ? dosesPerVial.toFixed(1) : "0.0";
      fields.weeksVial.textContent = Number.isFinite(weeks) && weeks > 0 ? weeks.toFixed(1) : "—";

      if (cycleWeeks > 0 && doseMg > 0 && dosesPerVial > 0) {
        const totalDoses = cycleWeeks * frequency;
        const vialsNeeded = Math.ceil(totalDoses / dosesPerVial);
        fields.vialsNeeded.textContent = vialsNeeded;
        fields.bacNeeded.textContent = bacMl > 0 ? `${(vialsNeeded * bacMl).toFixed(1)} mL` : "—";
      } else {
        fields.vialsNeeded.textContent = "—";
        fields.bacNeeded.textContent = "—";
      }

      updateFill(doseUnits);
    }

    root.querySelectorAll(".pc-syringe-btn").forEach((button) => {
      button.addEventListener("click", () => {
        state.syringeUnits = Number.parseFloat(button.dataset.units);
        root.querySelectorAll(".pc-syringe-btn").forEach((node) => node.classList.remove("is-active"));
        button.classList.add("is-active");
        fields.syringeUnitDisplay.textContent = `${state.syringeUnits} Units`;
        drawTicks(state.syringeUnits);
        calculate();
      });
    });

    [fields.vial, fields.bac, fields.dosage, fields.unit, fields.frequency, fields.cycle].forEach((field) => {
      field.addEventListener("input", calculate);
      field.addEventListener("change", calculate);
    });

    drawTicks(state.syringeUnits);
    calculate();
  }

  function initGlpCalculator() {
    const root = document.querySelector("#glp-half-life-calculator");
    if (!root) return;

    const intervalInput = root.querySelector("#glpInterval");
    const extraDaysInput = root.querySelector("#glpExtraDays");
    const doseRows = root.querySelector("#glpDoseRows");
    const addWeekBtn = root.querySelector("#glpAddWeek");
    const resetBtn = root.querySelector("#glpReset");
    const peakEl = root.querySelector("#glpPeak");
    const finalEl = root.querySelector("#glpFinal");
    const totalDoseEl = root.querySelector("#glpTotalDose");
    const canvas = root.querySelector("#glpChart");
    const halfLifeButtons = root.querySelectorAll(".glp-half-life-btn");
    const customWrap = root.querySelector("#glpCustomHalfLifeWrap");
    const customInput = root.querySelector("#glpCustomHalfLife");
    const selectedProfileEl = root.querySelector("#glpSelectedProfile");
    const selectedHalfLifeEl = root.querySelector("#glpSelectedHalfLife");

    const state = {
      selectedHalfLife: 7,
      selectedProfile: "GLP-1 (Sema)",
      isCustomHalfLife: false
    };

    const defaultDoses = [0.25, 0.25, 0.5, 0.5];

    function createDoseRow(weekNumber, doseValue) {
      const row = document.createElement("div");
      row.className = "glp-dose-item";
      row.innerHTML = `
        <div class="glp-week-label">Week ${weekNumber}</div>
        <input class="calc-input glp-dose-input" type="number" min="0" step="0.01" value="${doseValue}" aria-label="Dose for week ${weekNumber}">
        <button class="glp-remove" type="button" aria-label="Remove week ${weekNumber}">&times;</button>
      `;

      row.querySelector(".glp-dose-input").addEventListener("input", updateChart);
      row.querySelector(".glp-remove").addEventListener("click", () => {
        row.remove();
        renumberWeeks();
        updateChart();
      });

      return row;
    }

    function renumberWeeks() {
      doseRows.querySelectorAll(".glp-dose-item").forEach((row, index) => {
        const week = index + 1;
        row.querySelector(".glp-week-label").textContent = `Week ${week}`;
        row.querySelector(".glp-dose-input").setAttribute("aria-label", `Dose for week ${week}`);
        row.querySelector(".glp-remove").setAttribute("aria-label", `Remove week ${week}`);
      });
    }

    function loadDefaults() {
      doseRows.innerHTML = "";
      defaultDoses.forEach((dose, index) => doseRows.appendChild(createDoseRow(index + 1, dose)));
    }

    function getDoses() {
      return Array.from(doseRows.querySelectorAll(".glp-dose-input")).map((input) => {
        const value = Number.parseFloat(input.value);
        return Number.isNaN(value) || value < 0 ? 0 : value;
      });
    }

    function getHalfLife() {
      if (!state.isCustomHalfLife) return state.selectedHalfLife;
      const customValue = Number.parseFloat(customInput.value);
      return Number.isNaN(customValue) || customValue <= 0 ? 7 : customValue;
    }

    function updateHalfLifeDisplay() {
      const halfLife = getHalfLife();
      selectedProfileEl.textContent = state.selectedProfile;
      selectedHalfLifeEl.textContent = `${halfLife} days`;
    }

    function calculateDailyLevels(doses, halfLife, interval, extraDays) {
      const labels = [];
      const levels = [];
      const lastDoseDay = Math.max(0, (doses.length - 1) * interval);
      const totalDays = Math.round(lastDoseDay + extraDays);

      for (let day = 0; day <= totalDays; day += 1) {
        let level = 0;
        doses.forEach((dose, index) => {
          const doseDay = index * interval;
          if (day >= doseDay) {
            level += dose * Math.pow(0.5, (day - doseDay) / halfLife);
          }
        });
        labels.push(day);
        levels.push(Number(level.toFixed(4)));
      }

      return { labels, levels };
    }

    function drawChart(labels, levels) {
      const ctx = canvas.getContext("2d");
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(640, Math.floor(rect.width * ratio));
      canvas.height = Math.floor(430 * ratio);
      ctx.scale(ratio, ratio);

      const width = canvas.width / ratio;
      const height = canvas.height / ratio;
      const padding = { top: 24, right: 24, bottom: 46, left: 56 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      const maxLevel = Math.max(1, ...levels);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(188, 244, 255, 0.14)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "#c9e4ec";
      ctx.font = "12px Inter, system-ui, sans-serif";

      for (let i = 0; i <= 4; i += 1) {
        const y = padding.top + (plotHeight / 4) * i;
        const value = maxLevel - (maxLevel / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillText(value.toFixed(1), 10, y + 4);
      }

      const xFor = (index) => padding.left + (labels.length <= 1 ? 0 : (plotWidth * index) / (labels.length - 1));
      const yFor = (value) => padding.top + plotHeight - (value / maxLevel) * plotHeight;

      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, "rgba(66, 228, 255, 0.32)");
      gradient.addColorStop(1, "rgba(101, 255, 200, 0.02)");

      ctx.beginPath();
      levels.forEach((level, index) => {
        const x = xFor(index);
        const y = yFor(level);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(xFor(levels.length - 1), height - padding.bottom);
      ctx.lineTo(xFor(0), height - padding.bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      levels.forEach((level, index) => {
        const x = xFor(index);
        const y = yFor(level);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#42e4ff";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 12px Inter, system-ui, sans-serif";
      ctx.fillText("Days", width / 2 - 12, height - 12);
      ctx.save();
      ctx.translate(15, height / 2 + 48);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("Estimated Level", 0, 0);
      ctx.restore();
    }

    function updateChart() {
      const halfLife = getHalfLife();
      const interval = Number.parseFloat(intervalInput.value) || 7;
      const extraDays = Number.parseFloat(extraDaysInput.value) || 28;
      const doses = getDoses();
      const result = calculateDailyLevels(doses, halfLife, interval, extraDays);
      const peak = result.levels.length ? Math.max(...result.levels) : 0;
      const finalLevel = result.levels.length ? result.levels[result.levels.length - 1] : 0;
      const totalDose = doses.reduce((sum, dose) => sum + dose, 0);

      updateHalfLifeDisplay();
      peakEl.textContent = peak.toFixed(2);
      finalEl.textContent = finalLevel.toFixed(2);
      totalDoseEl.textContent = totalDose.toFixed(2);
      drawChart(result.labels, result.levels);
    }

    halfLifeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        halfLifeButtons.forEach((node) => node.classList.remove("is-active"));
        button.classList.add("is-active");
        const value = button.dataset.halfLife;
        state.selectedProfile = button.dataset.profile;

        if (value === "custom") {
          state.isCustomHalfLife = true;
          customWrap.classList.add("is-visible");
        } else {
          state.isCustomHalfLife = false;
          state.selectedHalfLife = Number.parseFloat(value);
          customWrap.classList.remove("is-visible");
        }

        updateChart();
      });
    });

    customInput.addEventListener("input", updateChart);
    intervalInput.addEventListener("input", updateChart);
    extraDaysInput.addEventListener("input", updateChart);
    window.addEventListener("resize", updateChart);

    addWeekBtn.addEventListener("click", () => {
      const weekNumber = doseRows.querySelectorAll(".glp-dose-item").length + 1;
      doseRows.appendChild(createDoseRow(weekNumber, 0));
      updateChart();
    });

    resetBtn.addEventListener("click", () => {
      state.selectedHalfLife = 7;
      state.selectedProfile = "GLP-1 (Sema)";
      state.isCustomHalfLife = false;
      customInput.value = 7;
      intervalInput.value = 7;
      extraDaysInput.value = 28;
      customWrap.classList.remove("is-visible");
      halfLifeButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.profile === "GLP-1 (Sema)");
      });
      loadDefaults();
      updateChart();
    });

    loadDefaults();
    updateChart();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPeptideCalculator();
    initGlpCalculator();
  });
})();
