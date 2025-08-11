# Black Hole Particle Simulation

This project is a **2D Python simulation** of particles (including photons) moving around a black hole.  
It uses Newtonian gravity for simplicity, with a configurable set of constants to control appearance and motion.  

---

## Features
- **Customizable simulation parameters** (black hole mass, speed of light, particle initial positions, etc.)
- **Supports photons** that move at a constant "speed of light" but are affected by gravity
- **Accretion disk, slingshot, and photon bending/capture effects**
- Adjustable **plot size**, **colors**, and **time step**
- Dark mode visualization for space-like effect

---

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/blackhole-sim.git
   cd blackhole-sim
2. Install Dependencies
    pip install numpy matplotlib
3. Run the simulation
    python blackhole_sim.py



## Configuring Parameters
Configuration
You can tweak all settings from the configuration section at the top of blackhole_sim.py:

Variable	Description
G	        Gravitational constant (simulation units)
M	        Black hole mass
C	        Speed of light in simulation units
TIME_STEP	Smaller values = smoother motion, slower sim
STEPS	Number of simulation steps
SHOW_ANIMATION	True to watch in real time, False to only show final frame
PLOT_LIMIT	X/Y axis range
FIGSIZE	Matplotlib figure size
BACKGROUND_STYLE	"dark_background" or "default"
PARTICLE_COLOR	Color for matter particles
PHOTON_COLOR	Color for photons
HORIZON_COLOR	Color of event horizon outline
PARTICLES	Initial particle setup (positions, velocities, type)
