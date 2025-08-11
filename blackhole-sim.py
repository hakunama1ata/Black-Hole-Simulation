import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

# CONFIGURATION PARAMETERS


# --- Physical constants (scaled for visualization) ---
G = 1.0                  # Gravitational constant (simulation units)
M = 1000.0               # Mass of black hole
C = 15.0                 # "Speed of light" in simulation units

# --- Simulation settings ---
TIME_STEP = 0.1           # Time step (smaller = smoother motion, slower sim)
STEPS = 1000              # Number of simulation steps
SHOW_ANIMATION = True     # If False, only final frame will be plotted

# --- Display settings ---
PLOT_LIMIT = 300          # Axis range in x and y directions
FIGSIZE = (10, 10)        # Size of figure
BACKGROUND_STYLE = "dark_background"  # 'dark_background' or 'default'
PARTICLE_COLOR = "cyan"
PHOTON_COLOR = "yellow"
HORIZON_COLOR = "red"

# --- Particles initial states ---
PARTICLES = [
    # Orbital particles
    {"pos": [100, 0], "vel": [0, 7.5], "is_photon": False},
    {"pos": [-110, 0], "vel": [0, -7.0], "is_photon": False},
    {"pos": [0, 130], "vel": [-6.5, 0], "is_photon": False},
    {"pos": [0, -140], "vel": [6.0, 0], "is_photon": False},

    # Slingshot particle
    {"pos": [-250, 50], "vel": [7, 0], "is_photon": False},

    # Photons
    {"pos": [-250, None], "vel": [C, 0], "is_photon": True, "offset_factor": 1.5},
    {"pos": [-250, None], "vel": [C, 0], "is_photon": True, "offset_factor": 0.8},
]


# ==========================
# SIMULATION CODE
# ==========================

class Particle:
    def __init__(self, pos, vel, mass=1.0, is_photon=False):
        self.pos = np.array(pos, dtype=float)
        self.vel = np.array(vel, dtype=float)
        self.mass = mass
        self.path = [self.pos.copy()]
        self.is_captured = False
        self.is_photon = is_photon

    def update(self, dt, black_hole_pos):
        if self.is_captured:
            return

        # Gravity vector
        r_vec = black_hole_pos - self.pos
        r_mag = np.linalg.norm(r_vec)
        if r_mag == 0:
            return

        # Newtonian gravitational force
        force_mag = (G * M * self.mass) / (r_mag**2)
        force_vec = force_mag * (r_vec / r_mag)

        # Update velocity
        acceleration = force_vec / self.mass
        self.vel += acceleration * dt

        # Photon speed correction
        if self.is_photon:
            self.vel = (self.vel / np.linalg.norm(self.vel)) * C

        # Update position
        self.pos += self.vel * dt
        self.path.append(self.pos.copy())


def run_simulation():
    black_hole_pos = np.array([0.0, 0.0])
    schwarzschild_radius = (2 * G * M) / (C**2)

    # Initialize particles
    particles = []
    for p in PARTICLES:
        pos = p["pos"].copy()
        if p.get("offset_factor") is not None:
            pos[1] = schwarzschild_radius * p["offset_factor"]
        particles.append(Particle(pos=pos, vel=p["vel"], is_photon=p["is_photon"]))

    plt.style.use(BACKGROUND_STYLE)
    fig, ax = plt.subplots(figsize=FIGSIZE)

    for _ in range(STEPS):
        ax.clear()

        for particle in particles:
            dist_to_bh = np.linalg.norm(particle.pos - black_hole_pos)
            if dist_to_bh < schwarzschild_radius:
                particle.is_captured = True

            particle.update(TIME_STEP, black_hole_pos)

            # Draw particle path
            path_arr = np.array(particle.path)
            color = PHOTON_COLOR if particle.is_photon else PARTICLE_COLOR
            ax.plot(path_arr[:, 0], path_arr[:, 1], color=color, lw=1, alpha=0.7)
            ax.scatter(particle.pos[0], particle.pos[1], color=color, s=10)

        # Draw black hole & horizon
        ax.add_patch(Circle(black_hole_pos, schwarzschild_radius, color="black", zorder=10))
        ax.add_patch(Circle(black_hole_pos, schwarzschild_radius, color=HORIZON_COLOR, lw=1.5, fill=False, zorder=11))

        ax.set_aspect('equal', 'box')
        ax.set_xlim(-PLOT_LIMIT, PLOT_LIMIT)
        ax.set_ylim(-PLOT_LIMIT, PLOT_LIMIT)
        ax.set_title(f"Black Hole Simulation (Mass={M})")

        if SHOW_ANIMATION:
            plt.pause(0.001)

    if not SHOW_ANIMATION:
        plt.show()


if __name__ == "__main__":
    run_simulation()
