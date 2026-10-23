// "Explain" panels for the simulations and the probability lab: what you see, how it works, what to look
// for, things to try and where it shows up. Both languages are in the page; CSS shows the one that matches
// <html lang>, so switching language needs no re-render (the panel is marked data-no-i18n).
//   Explain.attach(group)  -> { button, box, show(key) }   group: 'sim' | 'prob' | 'pi'
const Explain = (() => {
  const { el } = U;
  const KEY = 'mathsim.explain.open';
  let open = false;
  try { open = localStorage.getItem(KEY) === '1'; } catch { /* private window */ }
  const views = [];

  const HEAD = {
    en: { what: 'What you see', how: 'How it works', look: 'Look for', try: 'Try this', real: 'Where it shows up', close: 'Close' },
    de: { what: 'Was du siehst', how: 'Wie es funktioniert', look: 'Achte auf', try: 'Probier aus', real: 'Wo es vorkommt', close: 'Schließen' },
  };

  // Each entry: { en: { what, how, eq?, look: [], try: [], real }, de: { … } }
  const DATA = {
    sim: {
      life: {
        en: {
          what: 'A grid of cells that are either alive (green) or dead. Every generation, all cells update at the same time.',
          how: 'Each cell counts its 8 neighbours. In Conway’s rule a dead cell with exactly 3 live neighbours is born, a live cell with 2 or 3 survives, and every other cell dies of loneliness or overcrowding. The other rules change just these numbers.',
          eq: ['B3/S23  =  born with 3, survives with 2 or 3'],
          look: ['Still lifes that never change, blinkers that repeat, and gliders that travel diagonally across the grid.', 'The glider gun firing a new glider every 30 generations.', 'Random starts that burn out into a scattered “ash” of small stable shapes.'],
          try: ['Pick the R-pentomino: five cells that take 1103 generations to settle.', 'Switch to HighLife (B36/S23) or Day & Night and start from Random.', 'Pause, draw your own shape with the mouse, and press Step to follow it one generation at a time.'],
          real: 'Life is Turing complete: with enough space you can build a working computer out of gliders. It became the classic example of complex behaviour emerging from simple local rules.',
        },
        de: {
          what: 'Ein Gitter aus Zellen, die lebendig (grün) oder tot sind. In jeder Generation werden alle Zellen gleichzeitig neu berechnet.',
          how: 'Jede Zelle zählt ihre 8 Nachbarn. Nach Conways Regel wird eine tote Zelle mit genau 3 lebenden Nachbarn geboren, eine lebende mit 2 oder 3 überlebt, und alle anderen sterben an Einsamkeit oder Überbevölkerung. Die anderen Regeln ändern nur diese Zahlen.',
          eq: ['B3/S23  =  Geburt bei 3, Überleben bei 2 oder 3'],
          look: ['Stabile Formen, die sich nie ändern, Blinker, die sich wiederholen, und Gleiter, die schräg über das Gitter wandern.', 'Die Gleiterkanone, die alle 30 Generationen einen neuen Gleiter abschießt.', 'Zufällige Starts, die zu verstreuter „Asche“ aus kleinen stabilen Formen ausbrennen.'],
          try: ['Wähle das R-Pentomino: fünf Zellen, die 1103 Generationen brauchen, bis sie zur Ruhe kommen.', 'Wechsle zu HighLife (B36/S23) oder Day & Night und starte mit Zufall.', 'Halte an, zeichne mit der Maus eine eigene Form und verfolge sie mit „Schritt“ Generation für Generation.'],
          real: 'Life ist Turing-vollständig: Mit genug Platz kann man aus Gleitern einen funktionierenden Computer bauen. Es wurde zum klassischen Beispiel dafür, wie aus einfachen lokalen Regeln komplexes Verhalten entsteht.',
        },
      },
      eca: {
        en: {
          what: 'Each row is one moment in time of a single line of cells; time runs downwards.',
          how: 'A cell’s next value depends on three cells: its left neighbour, itself and its right neighbour. That makes 8 possible patterns (111, 110, … 000). Writing the 8 answers as a binary number gives the rule number, from 0 to 255.',
          eq: ['Rule 30 = 00011110₂: 111→0, 110→0, 101→0, 100→1, 011→1, 010→1, 001→1, 000→0'],
          look: ['Rule 90 drawing Sierpiński’s triangle from a single cell.', 'Rule 30’s centre column, which looks completely random.', 'Rule 110’s moving “particles” that collide and interact.'],
          try: ['Start from one cell, then from random, with the same rule.', 'Rule 184 as traffic: cars (1) move right when the space ahead is free. Watch jams travel backwards.', 'Type in rule numbers yourself and sort them into boring, repeating, chaotic and complex.'],
          real: 'Stephen Wolfram sorted all 256 rules into four classes. Rule 30 was used as a random number generator, and Rule 110 was proved able to compute anything. Some sea shells grow patterns like Rule 30.',
        },
        de: {
          what: 'Jede Zeile ist ein Zeitpunkt einer einzigen Reihe von Zellen; die Zeit läuft nach unten.',
          how: 'Der nächste Wert einer Zelle hängt von drei Zellen ab: dem linken Nachbarn, ihr selbst und dem rechten Nachbarn. Das ergibt 8 mögliche Muster (111, 110, … 000). Schreibt man die 8 Antworten als Binärzahl, erhält man die Regelnummer von 0 bis 255.',
          eq: ['Regel 30 = 00011110₂: 111→0, 110→0, 101→0, 100→1, 011→1, 010→1, 001→1, 000→0'],
          look: ['Regel 90 zeichnet aus einer einzigen Zelle das Sierpiński-Dreieck.', 'Die Mittelspalte von Regel 30 sieht völlig zufällig aus.', 'Die wandernden „Teilchen“ von Regel 110, die zusammenstoßen und sich beeinflussen.'],
          try: ['Starte dieselbe Regel einmal mit einer Zelle und einmal zufällig.', 'Regel 184 als Verkehr: Autos (1) fahren nach rechts, wenn vor ihnen frei ist. Staus wandern rückwärts.', 'Gib selbst Regelnummern ein und sortiere sie in langweilig, wiederholend, chaotisch und komplex.'],
          real: 'Stephen Wolfram teilte alle 256 Regeln in vier Klassen ein. Regel 30 wurde als Zufallsgenerator verwendet, und für Regel 110 wurde bewiesen, dass sie alles berechnen kann. Manche Muschelschalen wachsen in Mustern wie Regel 30.',
        },
      },
      lsys: {
        en: {
          what: 'A drawing made by a turtle following a long string of commands — plants, snowflakes and space-filling curves.',
          how: 'Start with a short word (the axiom) and replace every letter by its rule, over and over. The word grows exponentially. Then a turtle reads it: F draws a step forward, + and − turn by the angle, and [ ] remember and return to a position, which makes branches.',
          eq: ['F → F+F−−F+F  (angle 60°, start F−−F−−F)  gives the Koch snowflake'],
          look: ['Each level of the Koch snowflake makes the outline 4/3 times longer — infinitely long in the limit, around a finite area.', 'The plant: the same branching rule at every scale (self-similarity).', 'The Hilbert and dragon curves never crossing themselves.'],
          try: ['Change the angle of the fractal plant by a few degrees.', 'Raise the number of iterations one at a time and watch the detail double.', 'Edit a rule: add an extra [+F] to a branch and see the whole plant change.'],
          real: 'Aristid Lindenmayer invented L-systems in 1968 to describe how plants and algae grow. They are still used to generate trees and plants in films and games.',
        },
        de: {
          what: 'Eine Zeichnung, die eine Schildkröte nach einer langen Befehlsfolge macht — Pflanzen, Schneeflocken und raumfüllende Kurven.',
          how: 'Beginne mit einem kurzen Wort (dem Axiom) und ersetze jeden Buchstaben immer wieder durch seine Regel. Das Wort wächst exponentiell. Dann liest es eine Schildkröte: F zeichnet einen Schritt vorwärts, + und − drehen um den Winkel, und [ ] merken sich eine Position und kehren zu ihr zurück — so entstehen Äste.',
          eq: ['F → F+F−−F+F  (Winkel 60°, Start F−−F−−F)  ergibt die Koch-Schneeflocke'],
          look: ['Jede Stufe der Koch-Schneeflocke macht den Umriss 4/3-mal so lang — im Grenzfall unendlich lang, um eine endliche Fläche.', 'Die Pflanze: dieselbe Verzweigungsregel in jeder Größe (Selbstähnlichkeit).', 'Hilbert- und Drachenkurve, die sich nie selbst kreuzen.'],
          try: ['Ändere den Winkel der Fraktalpflanze um ein paar Grad.', 'Erhöhe die Zahl der Iterationen schrittweise und sieh zu, wie sich die Details verdoppeln.', 'Bearbeite eine Regel: Füge einem Ast ein zusätzliches [+F] hinzu und sieh, wie sich die ganze Pflanze ändert.'],
          real: 'Aristid Lindenmayer erfand L-Systeme 1968, um das Wachstum von Pflanzen und Algen zu beschreiben. Bis heute erzeugt man damit Bäume und Pflanzen in Filmen und Spielen.',
        },
      },
      rd: {
        en: {
          what: 'Two imaginary chemicals, U and V, spreading across a dish and reacting. The colour shows how much V there is.',
          how: 'Every point does two things at once. Diffusion: each chemical spreads to its neighbours, U twice as fast as V. Reaction: U + 2V → 3V, so V feeds on U. U is fed in at rate F and V is removed at rate k. Small changes to F and k give completely different patterns.',
          eq: ['∂u/∂t = Dᵤ∇²u − uv² + F(1 − u)', '∂v/∂t = Dᵥ∇²v + uv² − (F + k)v'],
          look: ['Spots that split in two like dividing cells (Mitosis).', 'Stripes that fill the dish like a maze or a fingerprint.', 'Patterns that settle into a steady state, and others that keep moving.'],
          try: ['Go through all the presets and compare their F and k values: they are very close together.', 'Paint chemical into a settled pattern and watch it heal or grow.', 'Record a clip of Mitosis from the start — it looks alive.'],
          real: 'Alan Turing proposed this mechanism in 1952 to explain how leopards get spots and zebras stripes. Patterns like these have since been found in zebrafish skin, sea shells and some chemical reactions.',
        },
        de: {
          what: 'Zwei gedachte Chemikalien, U und V, die sich in einer Schale ausbreiten und miteinander reagieren. Die Farbe zeigt, wie viel V vorhanden ist.',
          how: 'An jedem Punkt passiert zweierlei. Diffusion: Jede Chemikalie breitet sich zu den Nachbarn aus, U doppelt so schnell wie V. Reaktion: U + 2V → 3V, V ernährt sich also von U. U wird mit der Rate F zugeführt, V mit der Rate k entfernt. Kleine Änderungen an F und k ergeben völlig andere Muster.',
          eq: ['∂u/∂t = Dᵤ∇²u − uv² + F(1 − u)', '∂v/∂t = Dᵥ∇²v + uv² − (F + k)v'],
          look: ['Punkte, die sich wie Zellen teilen (Mitosis).', 'Streifen, die die Schale wie ein Labyrinth oder ein Fingerabdruck füllen.', 'Muster, die zur Ruhe kommen, und andere, die sich ständig bewegen.'],
          try: ['Geh alle Voreinstellungen durch und vergleiche F und k: Sie liegen sehr nah beieinander.', 'Male Chemikalie in ein fertiges Muster und sieh zu, wie es heilt oder wächst.', 'Nimm einen Clip von Mitosis ab Start auf — es sieht lebendig aus.'],
          real: 'Alan Turing schlug diesen Mechanismus 1952 vor, um zu erklären, wie Leoparden Flecken und Zebras Streifen bekommen. Solche Muster wurden seitdem in der Haut von Zebrafischen, auf Muschelschalen und in chemischen Reaktionen gefunden.',
        },
      },
      ulam: {
        en: {
          what: 'The whole numbers 1, 2, 3, … written in a square spiral outwards from the centre, with the primes marked.',
          how: 'Primes look scattered at random, yet in the spiral many of them line up on diagonals. Each diagonal is the set of values of a quadratic polynomial such as 4n² + 2n + 1. Some polynomials produce far more primes than others, and the spiral makes that visible.',
          eq: ['n² + n + 41 is prime for every n from 0 to 39'],
          look: ['Long diagonal lines with many primes, and others with almost none.', 'Twin primes (p and p + 2 both prime) still clustering, although they get rarer.', 'In the divisor view, bright spots at numbers with many divisors.'],
          try: ['Switch to Euler’s n² + n + 41 and look at the unbroken line of primes.', 'Compare the primes view with the number of divisors.', 'Choose the 501 × 501 grid to see the lines across a quarter of a million numbers.'],
          real: 'Stanisław Ulam found this while doodling during a boring talk in 1963. Why some quadratic polynomials hit so many primes is still not proved (the Bateman–Horn conjecture).',
        },
        de: {
          what: 'Die natürlichen Zahlen 1, 2, 3, … in einer quadratischen Spirale von der Mitte nach außen geschrieben, mit markierten Primzahlen.',
          how: 'Primzahlen wirken zufällig verstreut, doch in der Spirale liegen viele auf Diagonalen. Jede Diagonale besteht aus den Werten eines quadratischen Polynoms wie 4n² + 2n + 1. Manche Polynome liefern weit mehr Primzahlen als andere, und die Spirale macht das sichtbar.',
          eq: ['n² + n + 41 ist für jedes n von 0 bis 39 eine Primzahl'],
          look: ['Lange Diagonalen mit vielen Primzahlen und andere mit fast keinen.', 'Primzahlzwillinge (p und p + 2 beide prim), die sich ebenfalls häufen, auch wenn sie seltener werden.', 'In der Teileransicht helle Punkte bei Zahlen mit vielen Teilern.'],
          try: ['Wechsle zu Eulers n² + n + 41 und sieh dir die ununterbrochene Linie aus Primzahlen an.', 'Vergleiche die Primzahlen mit der Anzahl der Teiler.', 'Wähle das Gitter 501 × 501, um die Linien über eine Viertelmillion Zahlen zu sehen.'],
          real: 'Stanisław Ulam entdeckte das 1963, als er während eines langweiligen Vortrags kritzelte. Warum manche quadratischen Polynome so viele Primzahlen treffen, ist bis heute nicht bewiesen (Bateman-Horn-Vermutung).',
        },
      },
      boids: {
        en: {
          what: 'A flock of birds. Each one only sees its neighbours within the sight radius — there is no leader and no plan.',
          how: 'Every bird steers by three rules: separation (don’t crowd your neighbours), alignment (fly in their average direction) and cohesion (move towards their average position). The sliders set how strongly each rule pulls. The flock is not programmed anywhere; it emerges.',
          look: ['Separate groups finding each other and merging.', 'The flock flowing around the mouse like a swarm avoiding a hawk.', 'Waves of turning that pass through the whole flock.'],
          try: ['Set alignment to 0: the birds clump but no longer fly together.', 'Set separation to 0: they collapse into tight balls.', 'Make the sight radius very small, then very large.'],
          real: 'Craig Reynolds created “boids” in 1986. The same rules animated the bat swarms in Batman Returns and are used for crowds in films, for drone swarms and to study starlings and fish schools.',
        },
        de: {
          what: 'Ein Vogelschwarm. Jeder Vogel sieht nur seine Nachbarn innerhalb des Sichtradius — es gibt keinen Anführer und keinen Plan.',
          how: 'Jeder Vogel steuert nach drei Regeln: Trennung (dräng dich nicht an die Nachbarn), Ausrichtung (flieg in ihre mittlere Richtung) und Zusammenhalt (flieg zu ihrer mittleren Position). Die Regler bestimmen, wie stark jede Regel zieht. Der Schwarm ist nirgends programmiert; er entsteht von selbst.',
          look: ['Getrennte Gruppen, die sich finden und vereinigen.', 'Der Schwarm, der um die Maus herumfließt wie vor einem Habicht.', 'Wellen von Richtungswechseln, die durch den ganzen Schwarm laufen.'],
          try: ['Setze die Ausrichtung auf 0: Die Vögel klumpen, fliegen aber nicht mehr gemeinsam.', 'Setze die Trennung auf 0: Sie fallen zu dichten Knäueln zusammen.', 'Mach den Sichtradius sehr klein und dann sehr groß.'],
          real: 'Craig Reynolds erfand die „Boids“ 1986. Mit denselben Regeln wurden die Fledermausschwärme in Batmans Rückkehr animiert; man nutzt sie für Menschenmengen in Filmen, für Drohnenschwärme und zur Erforschung von Staren und Fischschwärmen.',
        },
      },
      ant: {
        en: {
          what: 'An ant walking on a grid of coloured squares, changing the colours as it goes.',
          how: 'On a white cell the ant turns right, on a coloured cell it turns left. Then it flips the colour of the cell and steps forward. For longer rules (like RLR) each letter says which way to turn on each colour in turn.',
          look: ['A small symmetric pattern for the first few hundred steps.', 'About 10 000 steps of apparent chaos.', 'Then suddenly a straight “highway” that repeats every 104 steps and goes on for ever.'],
          try: ['Use a high speed and wait for the highway — then record a clip of it appearing.', 'Click to add a second ant into the chaos and see whether a highway still forms.', 'Try LLRR for a symmetric shape and LRRRRRLLR for a growing square.'],
          real: 'Chris Langton invented the ant in 1986. Every starting pattern ever tried eventually builds a highway, but nobody has proved that it always will — a famous open problem about a very simple rule.',
        },
        de: {
          what: 'Eine Ameise, die über ein Gitter aus farbigen Feldern läuft und dabei die Farben ändert.',
          how: 'Auf einem weißen Feld dreht sich die Ameise nach rechts, auf einem farbigen nach links. Dann ändert sie die Farbe des Feldes und geht einen Schritt vorwärts. Bei längeren Regeln (wie RLR) gibt jeder Buchstabe an, wohin sie sich auf der jeweiligen Farbe dreht.',
          look: ['Ein kleines symmetrisches Muster in den ersten paar hundert Schritten.', 'Etwa 10 000 Schritte scheinbares Chaos.', 'Dann plötzlich eine gerade „Autobahn“, die sich alle 104 Schritte wiederholt und endlos weitergeht.'],
          try: ['Stell ein hohes Tempo ein und warte auf die Autobahn — und nimm dann einen Clip auf, wie sie entsteht.', 'Klicke, um eine zweite Ameise ins Chaos zu setzen, und sieh, ob trotzdem eine Autobahn entsteht.', 'Probiere LLRR für eine symmetrische Form und LRRRRRLLR für ein wachsendes Quadrat.'],
          real: 'Chris Langton erfand die Ameise 1986. Jedes bisher ausprobierte Startmuster baut irgendwann eine Autobahn, aber niemand hat bewiesen, dass das immer so ist — ein berühmtes offenes Problem über eine sehr einfache Regel.',
        },
      },
      sand: {
        en: {
          what: 'A pile of sand grains on a grid. Colours show how many grains each cell holds: none (background), 1 blue, 2 yellow or 3 red.',
          how: 'Grains are added one at a time. A cell that reaches 4 grains topples: it gives one grain to each of its four neighbours, which may make them topple too. Grains that fall off the edge are lost. The final picture does not depend on the order in which cells topple.',
          look: ['The pile growing into a detailed fractal pattern with fourfold symmetry.', 'Most new grains changing nothing, while a few set off avalanches across the whole pile.', 'The same pattern repeating at many scales.'],
          try: ['Lower the grains per frame to see single avalanches.', 'Click elsewhere to drop a second pile and watch where the two meet.', 'Record a clip from the start to watch the fractal grow.'],
          real: 'Bak, Tang and Wiesenfeld used this model in 1987 to explain self-organised criticality: systems that drive themselves to a tipping point, where events of every size happen. Earthquakes, forest fires and solar flares follow similar size laws.',
        },
        de: {
          what: 'Ein Sandhaufen auf einem Gitter. Die Farben zeigen, wie viele Körner in jeder Zelle liegen: keins (Hintergrund), 1 blau, 2 gelb oder 3 rot.',
          how: 'Die Körner kommen einzeln dazu. Eine Zelle mit 4 Körnern kippt um: Sie gibt jedem ihrer vier Nachbarn ein Korn, wodurch diese ebenfalls kippen können. Körner, die über den Rand fallen, gehen verloren. Das Endbild hängt nicht davon ab, in welcher Reihenfolge die Zellen kippen.',
          look: ['Der Haufen wächst zu einem detailreichen Fraktal mit vierfacher Symmetrie.', 'Die meisten neuen Körner ändern nichts, während einige wenige Lawinen über den ganzen Haufen auslösen.', 'Dasselbe Muster wiederholt sich in vielen Größen.'],
          try: ['Senke die Körner pro Bild, um einzelne Lawinen zu sehen.', 'Klicke woanders hin, um einen zweiten Haufen zu starten, und sieh, wo sich beide treffen.', 'Nimm einen Clip ab Start auf, um das Fraktal wachsen zu sehen.'],
          real: 'Bak, Tang und Wiesenfeld erklärten mit diesem Modell 1987 die selbstorganisierte Kritikalität: Systeme, die sich selbst an einen Kipppunkt treiben, an dem Ereignisse jeder Größe vorkommen. Erdbeben, Waldbrände und Sonneneruptionen folgen ähnlichen Größengesetzen.',
        },
      },
      dla: {
        en: {
          what: 'A cluster growing particle by particle into branches that look like frost, coral or lightning. The colour shows when each particle arrived.',
          how: 'One particle at a time wanders about at random (a random walk) until it touches the cluster, then it sticks for good. Tips stick out furthest, so wandering particles almost always hit them first. Tips grow faster, gaps between branches stay empty, and the shape becomes a fractal.',
          eq: ['N ∝ r^D with fractal dimension D ≈ 1.71'],
          look: ['Inner branches stop growing because the outer branches screen them off.', 'The measured fractal dimension settling near 1.7: more than a line (1), less than a filled area (2).', 'Growing up from the ground, the result looks like trees competing for light.'],
          try: ['Grow from a point and from the ground and compare the shapes.', 'Record a clip of a whole cluster growing — it ends by itself when finished.'],
          real: 'Diffusion-limited aggregation (Witten and Sander, 1981) describes mineral dendrites in rock, frost on windows, the branches of electrical breakdown (Lichtenberg figures) and copper deposited by electrolysis.',
        },
        de: {
          what: 'Ein Gebilde, das Teilchen für Teilchen zu Ästen wächst, die wie Eisblumen, Korallen oder Blitze aussehen. Die Farbe zeigt, wann jedes Teilchen ankam.',
          how: 'Jeweils ein Teilchen irrt zufällig umher (eine Irrfahrt), bis es das Gebilde berührt, dann bleibt es für immer kleben. Spitzen ragen am weitesten heraus, deshalb treffen umherirrende Teilchen fast immer zuerst sie. Spitzen wachsen schneller, Lücken zwischen den Ästen bleiben leer, und die Form wird ein Fraktal.',
          eq: ['N ∝ r^D mit fraktaler Dimension D ≈ 1,71'],
          look: ['Innere Äste hören auf zu wachsen, weil die äußeren sie abschirmen.', 'Die gemessene fraktale Dimension pendelt sich bei 1,7 ein: mehr als eine Linie (1), weniger als eine Fläche (2).', 'Vom Boden aus gewachsen sieht es aus wie Bäume, die um Licht konkurrieren.'],
          try: ['Lass es von einem Punkt und vom Boden aus wachsen und vergleiche die Formen.', 'Nimm einen Clip eines ganzen Wachstums auf — er endet von selbst, wenn es fertig ist.'],
          real: 'Diffusionsbegrenzte Aggregation (Witten und Sander, 1981) beschreibt Mineraldendriten im Gestein, Eisblumen an Fenstern, die Verästelungen elektrischer Entladungen (Lichtenberg-Figuren) und elektrolytisch abgeschiedenes Kupfer.',
        },
      },
      pend: {
        en: {
          what: 'A pendulum (or two) swinging under gravity, with the angle plotted over time.',
          how: 'The equations of motion are solved step by step with the Runge–Kutta method (RK4). For small swings sin θ ≈ θ and the period is 2π√(L/g), independent of the angle. For large swings that approximation fails and the pendulum is slower. A double pendulum adds a second arm, and its motion becomes chaotic.',
          eq: ['θ″ = −(g/L)·sin θ', 'T ≈ 2π√(L/g)  for small angles'],
          look: ['The real period drifting away from the dashed small-angle period as you raise the start angle.', 'In chaos mode: two double pendulums started 0.06° apart, together at first, then completely different.', 'Total energy staying constant without damping.'],
          try: ['Start at 170°: the pendulum waits at the top for a long time.', 'Make it 4 times longer: the period doubles.', 'Add damping and watch the swing die away.'],
          real: 'Galileo noticed that a pendulum’s period hardly depends on its swing, which made pendulum clocks the most accurate clocks for 300 years. The double pendulum is the textbook example of chaos: tiny differences make prediction impossible.',
        },
        de: {
          what: 'Ein Pendel (oder zwei), das unter der Schwerkraft schwingt, mit dem Winkel über der Zeit aufgetragen.',
          how: 'Die Bewegungsgleichungen werden Schritt für Schritt mit dem Runge-Kutta-Verfahren (RK4) gelöst. Bei kleinen Ausschlägen gilt sin θ ≈ θ, und die Periode ist 2π√(L/g), unabhängig vom Winkel. Bei großen Ausschlägen stimmt diese Näherung nicht mehr und das Pendel ist langsamer. Ein Doppelpendel hat einen zweiten Arm, und seine Bewegung wird chaotisch.',
          eq: ['θ″ = −(g/L)·sin θ', 'T ≈ 2π√(L/g)  für kleine Winkel'],
          look: ['Die echte Periode entfernt sich von der gestrichelten Kleinwinkel-Periode, wenn du den Startwinkel erhöhst.', 'Im Chaos-Modus: zwei Doppelpendel, 0,06° auseinander gestartet — erst gemeinsam, dann völlig verschieden.', 'Die Gesamtenergie bleibt ohne Dämpfung konstant.'],
          try: ['Starte bei 170°: Das Pendel verharrt lange oben.', 'Mach es 4-mal so lang: Die Periode verdoppelt sich.', 'Schalte Dämpfung ein und sieh zu, wie die Schwingung abklingt.'],
          real: 'Galilei bemerkte, dass die Periode eines Pendels kaum vom Ausschlag abhängt — deshalb waren Pendeluhren 300 Jahre lang die genauesten Uhren. Das Doppelpendel ist das Lehrbuchbeispiel für Chaos: Winzige Unterschiede machen Vorhersagen unmöglich.',
        },
      },
      proj: {
        en: {
          what: 'A ball thrown from a height at a chosen speed and angle. Up to six paths are kept so you can compare them.',
          how: 'Without air the only force is gravity, so the horizontal speed stays constant while the vertical speed changes steadily: the path is a parabola. Air resistance is a drag force proportional to the speed squared, pointing backwards, which slows the ball most when it is fast.',
          eq: ['x = v₀ cos α · t,   y = h₀ + v₀ sin α · t − ½ g t²', 'range on flat ground: R = v₀² sin 2α / g'],
          look: ['Without air, 30° and 60° landing at the same spot (sin 2α is the same).', 'With air resistance, a steeper fall at the end and a shorter range.', 'From a height, the best angle is less than 45°.'],
          try: ['Throw at 15°, 30°, 45°, 60° and 75° and compare the distances.', 'Add air resistance and find the new best angle.', 'Set gravity to the Moon’s 1.62 m/s².'],
          real: 'Used for sports (shot put, basketball, golf), artillery tables and spaceflight. Galileo first showed that projectiles move on parabolas.',
        },
        de: {
          what: 'Ein Ball, der aus einer Höhe mit gewählter Geschwindigkeit und gewähltem Winkel geworfen wird. Bis zu sechs Bahnen bleiben zum Vergleich stehen.',
          how: 'Ohne Luft wirkt nur die Schwerkraft: Die waagerechte Geschwindigkeit bleibt gleich, die senkrechte ändert sich gleichmäßig — die Bahn ist eine Parabel. Luftwiderstand ist eine bremsende Kraft proportional zum Quadrat der Geschwindigkeit, die den Ball bremst, solange er schnell ist.',
          eq: ['x = v₀ cos α · t,   y = h₀ + v₀ sin α · t − ½ g t²', 'Wurfweite auf ebenem Boden: R = v₀² sin 2α / g'],
          look: ['Ohne Luft landen 30° und 60° an derselben Stelle (sin 2α ist gleich).', 'Mit Luftwiderstand ein steilerer Fall am Ende und eine kürzere Weite.', 'Aus einer Höhe ist der beste Winkel kleiner als 45°.'],
          try: ['Wirf mit 15°, 30°, 45°, 60° und 75° und vergleiche die Weiten.', 'Schalte Luftwiderstand ein und finde den neuen besten Winkel.', 'Stell die Schwerkraft des Mondes ein: 1,62 m/s².'],
          real: 'Wichtig im Sport (Kugelstoßen, Basketball, Golf), für Schusstafeln und in der Raumfahrt. Galilei zeigte als Erster, dass Würfe auf Parabeln verlaufen.',
        },
      },
      orbit: {
        en: {
          what: 'A planet orbiting a star, with the area swept out in equal times shaded.',
          how: 'Gravity pulls the planet towards the star with a force proportional to 1/r². Below escape speed the orbit is an ellipse with the star at one focus, at exactly escape speed it is a parabola, and faster it is a hyperbola. The motion is integrated numerically; the orbital elements come from the energy and angular momentum.',
          eq: ['F = GMm / r²', 'escape speed = √2 × circular speed', 'T² / a³ = 4π² / GM  (the same for every orbit)'],
          look: ['The planet speeding up near the star and slowing down far away — yet the shaded areas stay equal (Kepler’s second law).', 'T²/a³ staying the same when you change the orbit (third law).', 'The orbit opening up when the start speed passes 1.414.'],
          try: ['Set the start speed to 1 for a circle, then 0.5 for a long thin ellipse.', 'Drag on the picture to launch the planet from another point.', 'Try 1.41 and 1.42 and see the orbit stop closing.'],
          real: 'Kepler found these laws from Tycho Brahe’s observations of Mars; Newton explained them with gravity. Space agencies use the same equations to plan transfers between orbits.',
        },
        de: {
          what: 'Ein Planet, der einen Stern umkreist, mit schattierten Flächen, die in gleichen Zeiten überstrichen werden.',
          how: 'Die Schwerkraft zieht den Planeten mit einer Kraft proportional zu 1/r² zum Stern. Unter der Fluchtgeschwindigkeit ist die Bahn eine Ellipse mit dem Stern in einem Brennpunkt, genau bei der Fluchtgeschwindigkeit eine Parabel, darüber eine Hyperbel. Die Bewegung wird numerisch berechnet; die Bahnelemente folgen aus Energie und Drehimpuls.',
          eq: ['F = GMm / r²', 'Fluchtgeschwindigkeit = √2 × Kreisbahngeschwindigkeit', 'T² / a³ = 4π² / GM  (für jede Bahn gleich)'],
          look: ['Der Planet wird nahe am Stern schneller und weit weg langsamer — trotzdem bleiben die schattierten Flächen gleich groß (2. Keplersches Gesetz).', 'T²/a³ bleibt gleich, wenn du die Bahn änderst (3. Gesetz).', 'Die Bahn öffnet sich, wenn die Startgeschwindigkeit 1,414 überschreitet.'],
          try: ['Stell die Startgeschwindigkeit auf 1 für einen Kreis, dann auf 0,5 für eine lange schmale Ellipse.', 'Ziehe auf dem Bild, um den Planeten von einem anderen Punkt aus zu starten.', 'Probiere 1,41 und 1,42 und sieh, wie sich die Bahn nicht mehr schließt.'],
          real: 'Kepler fand diese Gesetze anhand von Tycho Brahes Beobachtungen des Mars; Newton erklärte sie mit der Gravitation. Raumfahrtagenturen planen mit denselben Gleichungen Bahnwechsel.',
        },
      },
      grav: {
        en: {
          what: 'Several bodies all pulling on each other by gravity, with their trails.',
          how: 'For every pair of bodies the force is Gm₁m₂/r², and each body adds up the pulls from all the others. The motion is advanced with the leapfrog method (kick, drift, kick), which keeps the energy from drifting over long runs. Two bodies always follow ellipses; three or more usually have no formula at all.',
          eq: ['aᵢ = Σⱼ G mⱼ (rⱼ − rᵢ) / |rⱼ − rᵢ|³'],
          look: ['The figure-eight: three equal stars chasing each other along one path, found in 2000.', 'Small Trojan bodies riding 60° ahead of and behind the planet at the Lagrange points.', 'In the star cluster, stars thrown out completely by close encounters.'],
          try: ['Drag to throw a new body into the figure-eight and watch the dance break up.', 'Make the new bodies heavy and drop one next to the planet and moon.', 'Turn the trails off and on to see the paths.'],
          real: 'Since Newton, mathematicians have tried to solve the three-body problem. Poincaré proved in 1890 that it has no general solution and discovered chaos along the way. Jupiter really does have thousands of Trojan asteroids at its Lagrange points.',
        },
        de: {
          what: 'Mehrere Körper, die sich alle gegenseitig durch Gravitation anziehen, mit ihren Spuren.',
          how: 'Für jedes Paar ist die Kraft Gm₁m₂/r², und jeder Körper summiert die Anziehung aller anderen. Die Bewegung wird mit dem Leapfrog-Verfahren (Kick, Drift, Kick) berechnet, bei dem die Energie auch über lange Zeit nicht wegdriftet. Zwei Körper laufen immer auf Ellipsen; für drei oder mehr gibt es meist überhaupt keine Formel.',
          eq: ['aᵢ = Σⱼ G mⱼ (rⱼ − rᵢ) / |rⱼ − rᵢ|³'],
          look: ['Die Acht: drei gleiche Sterne, die einander auf einer einzigen Bahn jagen, gefunden im Jahr 2000.', 'Kleine Trojaner, die 60° vor und hinter dem Planeten an den Lagrange-Punkten mitlaufen.', 'Im Sternhaufen Sterne, die bei nahen Begegnungen ganz hinausgeschleudert werden.'],
          try: ['Ziehe, um einen neuen Körper in die Acht zu werfen, und sieh zu, wie der Tanz zerfällt.', 'Mach neue Körper schwer und setze einen neben Planet und Mond.', 'Schalte die Spuren aus und ein, um die Bahnen zu sehen.'],
          real: 'Seit Newton versuchen Mathematiker, das Dreikörperproblem zu lösen. Poincaré bewies 1890, dass es keine allgemeine Lösung gibt, und entdeckte dabei das Chaos. Jupiter hat tatsächlich Tausende Trojaner an seinen Lagrange-Punkten.',
        },
      },
      ripple: {
        en: {
          what: 'A water surface seen from above: bright for crests, dark for troughs. Sources or slits make waves that spread and overlap.',
          how: 'Each point of the surface is pulled back towards the average height of its neighbours, which is the wave equation on a grid. Where two waves meet their heights simply add (superposition): crest plus crest makes a bigger crest, crest plus trough cancels.',
          eq: ['∂²h/∂t² = c² ∇²h', 'bright stripes where the path difference is a whole number of wavelengths: d sin θ = nλ'],
          look: ['Calm lines fanning out from between two sources where the waves always cancel.', 'In intensity view, still stripes instead of moving waves.', 'A single slit spreading the wave out (diffraction) — narrower slits spread it more.'],
          try: ['Move the sources further apart: more stripes, closer together.', 'Shorten the period (shorter waves) and watch the stripes get finer.', 'Switch to Drops only and click to throw stones into the water.'],
          real: 'Thomas Young’s double-slit experiment (1801) used this pattern to prove that light is a wave. Later the same pattern appeared with single electrons, one of the founding experiments of quantum mechanics. Noise-cancelling headphones use destructive interference.',
        },
        de: {
          what: 'Eine Wasseroberfläche von oben: hell für Wellenberge, dunkel für Täler. Quellen oder Spalte erzeugen Wellen, die sich ausbreiten und überlagern.',
          how: 'Jeder Punkt der Oberfläche wird zur mittleren Höhe seiner Nachbarn zurückgezogen — das ist die Wellengleichung auf einem Gitter. Wo zwei Wellen sich treffen, addieren sich ihre Höhen einfach (Superposition): Berg plus Berg ergibt einen höheren Berg, Berg plus Tal löscht sich aus.',
          eq: ['∂²h/∂t² = c² ∇²h', 'helle Streifen, wo der Gangunterschied ein ganzes Vielfaches der Wellenlänge ist: d sin θ = nλ'],
          look: ['Ruhige Linien, die sich zwischen zwei Quellen auffächern, wo sich die Wellen immer auslöschen.', 'In der Intensitätsansicht stehende Streifen statt laufender Wellen.', 'Ein Einzelspalt, der die Welle auffächert (Beugung) — engere Spalte fächern stärker.'],
          try: ['Schieb die Quellen weiter auseinander: mehr Streifen, enger beieinander.', 'Verkürze die Periode (kürzere Wellen) und sieh, wie die Streifen feiner werden.', 'Wechsle zu „Nur Tropfen“ und klicke, um Steine ins Wasser zu werfen.'],
          real: 'Thomas Youngs Doppelspaltversuch (1801) bewies mit diesem Muster, dass Licht eine Welle ist. Später zeigte sich dasselbe Muster mit einzelnen Elektronen — einer der Grundversuche der Quantenmechanik. Kopfhörer mit Geräuschunterdrückung nutzen destruktive Interferenz.',
        },
      },
      gas: {
        en: {
          what: 'Hard discs bouncing around a box: a gas, seen molecule by molecule. The chart shows how many particles have each speed.',
          how: 'Particles move in straight lines and collide elastically with each other and the walls, so energy and momentum are conserved in every collision. No rule says how fast each particle must go, yet collisions quickly share the energy out into one particular distribution. Temperature is the average kinetic energy; pressure is the push of particles hitting the walls.',
          eq: ['P·A = N·k·T  (the ideal gas law in 2D)', 'f(v) ∝ v · e^(−mv²/2kT)  (Maxwell–Boltzmann in 2D)'],
          look: ['All particles start at the same speed, but within seconds the histogram matches the orange curve.', 'The measured P·A/N·kT staying close to 1.', 'The big particle zigzagging at random as it is hit from all sides.'],
          try: ['Raise the temperature: the curve gets wider and moves right.', 'Turn on the big heavy particle and follow its path — that is Brownian motion.', 'Use only a few particles and see the statistics get noisy.'],
          real: 'Maxwell and Boltzmann used this picture to explain heat and pressure in the 1860s–70s, before atoms had been seen. Einstein’s 1905 explanation of Brownian motion, confirmed by Perrin, finally proved that atoms exist.',
        },
        de: {
          what: 'Harte Scheiben, die in einer Kiste umherprallen: ein Gas, Molekül für Molekül. Das Diagramm zeigt, wie viele Teilchen welche Geschwindigkeit haben.',
          how: 'Die Teilchen fliegen geradeaus und stoßen elastisch miteinander und mit den Wänden zusammen, sodass Energie und Impuls bei jedem Stoß erhalten bleiben. Keine Regel schreibt vor, wie schnell ein Teilchen sein muss, doch die Stöße verteilen die Energie rasch auf eine ganz bestimmte Verteilung. Die Temperatur ist die mittlere Bewegungsenergie, der Druck der Stoß der Teilchen gegen die Wände.',
          eq: ['P·A = N·k·T  (ideales Gasgesetz in 2D)', 'f(v) ∝ v · e^(−mv²/2kT)  (Maxwell-Boltzmann in 2D)'],
          look: ['Alle Teilchen starten gleich schnell, doch nach Sekunden passt das Histogramm zur orangen Kurve.', 'Der gemessene Wert P·A/N·kT bleibt nahe bei 1.', 'Das große Teilchen torkelt im Zickzack, weil es von allen Seiten angestoßen wird.'],
          try: ['Erhöhe die Temperatur: Die Kurve wird breiter und rückt nach rechts.', 'Schalte das große schwere Teilchen ein und verfolge seinen Weg — das ist Brownsche Bewegung.', 'Nimm nur wenige Teilchen und sieh, wie die Statistik unruhig wird.'],
          real: 'Maxwell und Boltzmann erklärten mit diesem Bild in den 1860er- und 70er-Jahren Wärme und Druck, bevor jemand Atome gesehen hatte. Einsteins Erklärung der Brownschen Bewegung 1905, von Perrin bestätigt, bewies schließlich, dass es Atome gibt.',
        },
      },
      epi: {
        en: {
          what: 'A chain of rotating circles, each attached to the edge of the previous one. The tip of the last circle redraws your shape.',
          how: 'The outline is sampled as complex numbers z = x + iy, and the discrete Fourier transform splits it into circles that each turn at a whole-number speed (0, ±1, ±2, …) with a fixed size and starting angle. Adding the circles back together in order of size rebuilds the path, the big ones first.',
          eq: ['z(t) = Σₖ cₖ · e^(2πi k t)', 'cₖ = (1/N) Σₙ zₙ · e^(−2πi k n / N)'],
          look: ['A handful of circles already giving the rough outline.', 'Sharp corners needing many small, fast circles.', 'The circles getting smaller quickly for smooth shapes.'],
          try: ['Draw your own shape, then set the number of circles to 3, 10 and 100.', 'Compare the heart with the square: which needs more circles?', 'Record a clip of the circles drawing your shape.'],
          real: 'Fourier series are used everywhere: JPEG and MP3 compression, analysing sound, solving heat and wave equations. Ancient astronomers described planetary motion with epicycles too — in effect a Fourier series.',
        },
        de: {
          what: 'Eine Kette rotierender Kreise, jeder am Rand des vorigen befestigt. Die Spitze des letzten Kreises zeichnet deine Form nach.',
          how: 'Der Umriss wird als komplexe Zahlen z = x + iy abgetastet, und die diskrete Fourier-Transformation zerlegt ihn in Kreise, die sich mit ganzzahliger Geschwindigkeit (0, ±1, ±2, …) drehen, jeder mit fester Größe und Startwinkel. Setzt man die Kreise der Größe nach wieder zusammen, die großen zuerst, entsteht wieder die Kurve.',
          eq: ['z(t) = Σₖ cₖ · e^(2πi k t)', 'cₖ = (1/N) Σₙ zₙ · e^(−2πi k n / N)'],
          look: ['Schon eine Handvoll Kreise ergibt den groben Umriss.', 'Scharfe Ecken brauchen viele kleine, schnelle Kreise.', 'Bei glatten Formen werden die Kreise schnell kleiner.'],
          try: ['Zeichne eine eigene Form und stell dann 3, 10 und 100 Kreise ein.', 'Vergleiche Herz und Quadrat: Was braucht mehr Kreise?', 'Nimm einen Clip auf, wie die Kreise deine Form zeichnen.'],
          real: 'Fourier-Reihen stecken überall: in JPEG- und MP3-Kompression, in der Tonanalyse, beim Lösen von Wärme- und Wellengleichungen. Auch antike Astronomen beschrieben die Planetenbahnen mit Epizykeln — im Grunde eine Fourier-Reihe.',
        },
      },
      sir: {
        en: {
          what: 'People moving around a square. Blue are susceptible (healthy), red infectious, grey recovered and immune. The chart below shows the three groups over time.',
          how: 'An ill person can infect anyone within the infection distance; the chance per day of contact is the infection rate. After the recovery time they are immune. People who stay at home don’t move, so they meet far fewer others. This is the SIR model, simulated person by person instead of with equations.',
          eq: ['S′ = −β S I / N,   I′ = β S I / N − γ I,   R′ = γ I', 'R₀ = β / γ: the epidemic grows while R₀ · S/N > 1'],
          look: ['The red curve rising, peaking and falling: the epidemic stops before everyone is ill (herd immunity).', 'With many people at home the peak is lower and later — the curve is “flattened”.', 'Sometimes the outbreak dies out on its own at the very start.'],
          try: ['Set staying at home to 0 %, then 50 %, then 80 % and compare the peaks.', 'Make people recover faster.', 'Record a clip of the curve with and without staying at home to compare side by side.'],
          real: 'Kermack and McKendrick introduced the SIR model in 1927. Versions of it guided decisions during the COVID-19 pandemic and help plan vaccination campaigns.',
        },
        de: {
          what: 'Menschen, die sich in einem Quadrat bewegen. Blau sind empfänglich (gesund), rot ansteckend, grau genesen und immun. Das Diagramm darunter zeigt die drei Gruppen über die Zeit.',
          how: 'Eine kranke Person kann jeden innerhalb der Ansteckungsdistanz infizieren; die Chance pro Kontakttag ist die Ansteckungsrate. Nach der Genesungszeit ist sie immun. Wer zu Hause bleibt, bewegt sich nicht und trifft dadurch viel weniger andere. Das ist das SIR-Modell, Person für Person simuliert statt mit Gleichungen.',
          eq: ['S′ = −β S I / N,   I′ = β S I / N − γ I,   R′ = γ I', 'R₀ = β / γ: Die Epidemie wächst, solange R₀ · S/N > 1'],
          look: ['Die rote Kurve steigt, erreicht einen Gipfel und fällt: Die Epidemie endet, bevor alle krank waren (Herdenimmunität).', 'Wenn viele zu Hause bleiben, ist der Gipfel niedriger und später — die Kurve wird „abgeflacht“.', 'Manchmal stirbt der Ausbruch gleich zu Beginn von selbst aus.'],
          try: ['Stell „zu Hause bleiben“ auf 0 %, dann 50 %, dann 80 % und vergleiche die Gipfel.', 'Lass die Menschen schneller genesen.', 'Nimm je einen Clip mit und ohne „zu Hause bleiben“ auf und vergleiche sie.'],
          real: 'Kermack und McKendrick stellten das SIR-Modell 1927 vor. Varianten davon halfen bei Entscheidungen in der COVID-19-Pandemie und bei der Planung von Impfkampagnen.',
        },
      },
      prey: {
        en: {
          what: 'Rabbits (blue) and foxes (orange) over time on the right, and the same story as a path in the phase plane on the left (rabbits across, foxes up).',
          how: 'Rabbits multiply on their own and are eaten when they meet foxes. Foxes need rabbits to reproduce and die out without them. These two rules, written as differential equations and solved numerically, make the populations chase each other round in a cycle.',
          eq: ['x′ = αx − βxy   (rabbits)', 'y′ = δxy − γy   (foxes)', 'with limited food: αx(1 − x/K) instead of αx'],
          look: ['The fox peak always coming a little after the rabbit peak.', 'Closed loops in the phase plane: the same cycle repeating for ever.', 'With limited food, the loops spiralling in to a steady balance.'],
          try: ['Click in the phase plane to start from another point: a bigger or smaller loop.', 'Turn on limited food and lower K.', 'Raise the hunting success β and see the cycles become more extreme.'],
          real: 'Lotka and Volterra built this model in the 1920s, Volterra to explain fish catches in the Adriatic during the First World War. Fur-trade records of lynx and snowshoe hares in Canada show cycles like these over 90 years.',
        },
        de: {
          what: 'Hasen (blau) und Füchse (orange) über die Zeit rechts, und dieselbe Geschichte als Weg in der Phasenebene links (Hasen nach rechts, Füchse nach oben).',
          how: 'Hasen vermehren sich von selbst und werden gefressen, wenn sie Füchsen begegnen. Füchse brauchen Hasen, um sich zu vermehren, und sterben ohne sie aus. Diese zwei Regeln, als Differentialgleichungen geschrieben und numerisch gelöst, lassen die Bestände einander im Kreis jagen.',
          eq: ['x′ = αx − βxy   (Hasen)', 'y′ = δxy − γy   (Füchse)', 'mit begrenztem Futter: αx(1 − x/K) statt αx'],
          look: ['Der Gipfel der Füchse kommt immer etwas nach dem der Hasen.', 'Geschlossene Schleifen in der Phasenebene: derselbe Zyklus wiederholt sich endlos.', 'Mit begrenztem Futter spiralen die Schleifen in ein festes Gleichgewicht.'],
          try: ['Klicke in die Phasenebene, um woanders zu starten: eine größere oder kleinere Schleife.', 'Schalte begrenztes Futter ein und senke K.', 'Erhöhe den Jagderfolg β und sieh, wie die Zyklen extremer werden.'],
          real: 'Lotka und Volterra entwickelten das Modell in den 1920er-Jahren, Volterra, um die Fischfänge in der Adria im Ersten Weltkrieg zu erklären. Pelzhandelsdaten von Luchsen und Schneeschuhhasen in Kanada zeigen solche Zyklen über 90 Jahre.',
        },
      },
      logi: {
        en: {
          what: 'One rule applied again and again to a number between 0 and 1: as a cobweb (left), as a time series, and for every r at once as the bifurcation diagram.',
          how: 'x is the population as a share of the maximum. Each year it grows by the factor r, but less when it is near the maximum. In the cobweb, each step goes up to the curve (the next value) and across to the diagonal (making it the new x). Depending on r, x settles, cycles or never repeats.',
          eq: ['xₙ₊₁ = r · xₙ · (1 − xₙ)'],
          look: ['r < 3: one fixed value. At r = 3 a 2-cycle, then 4, 8, 16 … ever faster.', 'r ≈ 3.57: chaos. Two start values that differ in the 6th decimal soon disagree completely.', 'Calm windows inside the chaos, such as the 3-cycle near r = 3.83.'],
          try: ['Click the bifurcation diagram to set r, starting at 2.8 and going up.', 'Set r = 4 and change x₀ only slightly.', 'Record a clip of the cobweb at r = 3.83.'],
          real: 'Robert May’s 1976 paper on this map made chaos famous. Feigenbaum found that the period doublings always speed up by the same factor, 4.669…, in many different systems — even in dripping taps and fluid convection.',
        },
        de: {
          what: 'Eine Regel, die immer wieder auf eine Zahl zwischen 0 und 1 angewendet wird: als Spinnwebdiagramm (links), als Zeitreihe und für alle r zugleich als Bifurkationsdiagramm.',
          how: 'x ist die Population als Anteil am Maximum. Jedes Jahr wächst sie um den Faktor r, aber weniger, wenn sie nahe am Maximum ist. Im Spinnwebdiagramm geht jeder Schritt hoch zur Kurve (der nächste Wert) und waagerecht zur Diagonale (der neue x-Wert). Je nach r pendelt sich x ein, schwingt im Zyklus oder wiederholt sich nie.',
          eq: ['xₙ₊₁ = r · xₙ · (1 − xₙ)'],
          look: ['r < 3: ein fester Wert. Bei r = 3 ein 2er-Zyklus, dann 4, 8, 16 … immer schneller.', 'r ≈ 3,57: Chaos. Zwei Startwerte, die sich in der 6. Nachkommastelle unterscheiden, laufen bald völlig auseinander.', 'Ruhige Fenster im Chaos, etwa der 3er-Zyklus bei r = 3,83.'],
          try: ['Klicke ins Bifurkationsdiagramm, um r zu wählen — beginne bei 2,8 und geh nach oben.', 'Setze r = 4 und ändere x₀ nur ein wenig.', 'Nimm einen Clip des Spinnwebdiagramms bei r = 3,83 auf.'],
          real: 'Robert Mays Artikel von 1976 über diese Abbildung machte das Chaos berühmt. Feigenbaum fand heraus, dass die Periodenverdopplungen in vielen verschiedenen Systemen immer um denselben Faktor 4,669… schneller werden — sogar bei tropfenden Wasserhähnen und Konvektion.',
        },
      },
      sort: {
        en: {
          what: 'Bars of different heights being put in order. Yellow bars are being compared, red ones written, green ones are in their final place.',
          how: 'Each algorithm only ever compares two values and moves values around. The counters show how much work it does. Simple methods compare roughly every pair, about n²/2 comparisons. Clever ones split the problem in halves and need only about n·log₂n.',
          eq: ['n = 400:  n²/2 = 80 000   vs   n·log₂n ≈ 3 460'],
          look: ['Bubble sort carrying the biggest values to the right one at a time.', 'Quicksort splitting the bars around a pivot and working on both sides.', 'Merge sort building longer and longer sorted runs.', 'Insertion sort finishing almost at once on nearly sorted input.'],
          try: ['Run every algorithm on the same input and compare the comparison counters with n²/2 and n·log₂n.', 'Give insertion sort nearly sorted data, then reversed data.', 'Record a clip of each algorithm with Reset first ticked, so each starts shuffled — the clip ends when sorting is done.'],
          real: 'Sorting is one of the most common jobs computers do, in databases, spreadsheets and search engines. It can be proved that no method based on comparisons can beat about n·log₂n comparisons in the worst case.',
        },
        de: {
          what: 'Balken verschiedener Höhe, die in Reihenfolge gebracht werden. Gelbe Balken werden verglichen, rote geschrieben, grüne stehen an ihrem endgültigen Platz.',
          how: 'Jedes Verfahren vergleicht immer nur zwei Werte und verschiebt Werte. Die Zähler zeigen, wie viel Arbeit es macht. Einfache Verfahren vergleichen ungefähr jedes Paar, etwa n²/2 Vergleiche. Geschickte teilen das Problem in Hälften und brauchen nur etwa n·log₂n.',
          eq: ['n = 400:  n²/2 = 80 000   gegen   n·log₂n ≈ 3 460'],
          look: ['Bubblesort trägt die größten Werte einen nach dem anderen nach rechts.', 'Quicksort teilt die Balken um ein Pivotelement und arbeitet auf beiden Seiten weiter.', 'Mergesort baut immer längere sortierte Abschnitte.', 'Insertionsort ist bei fast sortierten Daten fast sofort fertig.'],
          try: ['Lass jedes Verfahren auf dieselbe Eingabe los und vergleiche den Vergleichszähler mit n²/2 und n·log₂n.', 'Gib Insertionsort fast sortierte Daten, dann umgekehrte.', 'Nimm von jedem Verfahren einen Clip mit „Erst zurücksetzen“ auf, damit jedes gemischt beginnt — der Clip endet, wenn fertig sortiert ist.'],
          real: 'Sortieren gehört zu den häufigsten Aufgaben von Computern, in Datenbanken, Tabellen und Suchmaschinen. Man kann beweisen, dass kein Verfahren, das auf Vergleichen beruht, im schlechtesten Fall weniger als etwa n·log₂n Vergleiche braucht.',
        },
      },
      path: {
        en: {
          what: 'A search for the way from S to G across a grid with walls (grey) and mud (brown, costs 5 per step). Shaded cells have been explored; the orange line is the path found.',
          how: 'Each algorithm keeps a frontier of cells to look at next and always expands the “best” one. Breadth-first takes the one reached in the fewest steps, Dijkstra the cheapest one so far, greedy the one that looks closest to G, and A* adds the cost so far to a straight-line estimate of the distance still to go.',
          eq: ['A*: f(cell) = g(cost so far) + h(estimate to the goal)'],
          look: ['Dijkstra spreading in a circle, A* reaching out towards the goal.', 'Breadth-first walking straight through mud because it counts steps, not cost.', 'Greedy rushing ahead, then getting stuck behind a wall and taking a longer way.'],
          try: ['Use the same maze with all four algorithms and compare explored cells and path cost.', 'Draw a mud pond between S and G.', 'Drag S and G to opposite corners of a maze.'],
          real: 'A* and Dijkstra’s algorithm plan routes in satnavs and map apps, move characters in video games and route data across the internet.',
        },
        de: {
          what: 'Die Suche nach dem Weg von S nach G über ein Gitter mit Wänden (grau) und Schlamm (braun, kostet 5 pro Schritt). Schattierte Zellen wurden untersucht; die orange Linie ist der gefundene Weg.',
          how: 'Jedes Verfahren führt eine Liste von Zellen, die als Nächstes dran sind, und erweitert immer die „beste“. Breitensuche nimmt die mit den wenigsten Schritten, Dijkstra die bisher günstigste, die gierige Suche die, die G am nächsten zu sein scheint, und A* addiert die bisherigen Kosten zu einer Luftlinien-Schätzung der Reststrecke.',
          eq: ['A*: f(Zelle) = g(bisherige Kosten) + h(Schätzung bis zum Ziel)'],
          look: ['Dijkstra breitet sich im Kreis aus, A* streckt sich zum Ziel hin.', 'Breitensuche läuft mitten durch den Schlamm, weil sie Schritte zählt, nicht Kosten.', 'Die gierige Suche prescht vor, bleibt hinter einer Wand hängen und nimmt einen längeren Weg.'],
          try: ['Nimm dasselbe Labyrinth mit allen vier Verfahren und vergleiche untersuchte Zellen und Wegkosten.', 'Zeichne einen Schlammteich zwischen S und G.', 'Zieh S und G in gegenüberliegende Ecken eines Labyrinths.'],
          real: 'A* und Dijkstras Algorithmus planen Routen in Navis und Karten-Apps, bewegen Figuren in Videospielen und leiten Daten durchs Internet.',
        },
      },
      tsp: {
        en: {
          what: 'A route through every city and back to the start, being improved step by step. The counter shows its length.',
          how: 'Trying every route is hopeless: there are (n − 1)!/2 of them. 2-opt instead picks two edges of the route and reverses the stretch between them whenever that makes it shorter, which removes every crossing. It stops at a route that no single such move can improve. Simulated annealing also accepts some moves that make it longer, less and less often as the “temperature” falls, so it can escape those dead ends.',
          eq: ['accept a longer route with probability e^(−Δ/T)'],
          look: ['Crossings disappearing one by one: an optimal route never crosses itself.', 'Annealing first scrambling the route, then settling into a good one as it cools.', 'Cities on a circle: the best route is simply the circle.'],
          try: ['Run 2-opt and annealing on the same cities and compare the final lengths.', 'Start from the nearest-neighbour route instead of a random one.', 'Click to add cities while it runs.'],
          real: 'The travelling salesman problem is NP-hard: no fast method is known that always finds the best route. Methods like these plan delivery routes, drill paths for circuit boards and telescope schedules.',
        },
        de: {
          what: 'Eine Rundreise durch alle Städte zurück zum Start, die Schritt für Schritt verbessert wird. Der Zähler zeigt ihre Länge.',
          how: 'Alle Routen auszuprobieren ist aussichtslos: Es gibt (n − 1)!/2 davon. 2-opt wählt stattdessen zwei Kanten der Route und dreht das Stück dazwischen um, wenn sie dadurch kürzer wird — so verschwindet jede Kreuzung. Es endet bei einer Route, die kein solcher Zug mehr verbessert. Simuliertes Abkühlen nimmt auch manche Züge an, die die Route verlängern, immer seltener, je weiter die „Temperatur“ sinkt — so kommt es aus solchen Sackgassen heraus.',
          eq: ['eine längere Route wird mit Wahrscheinlichkeit e^(−Δ/T) angenommen'],
          look: ['Kreuzungen verschwinden eine nach der anderen: Eine optimale Route kreuzt sich nie.', 'Das Abkühlen bringt die Route erst durcheinander und findet dann beim Abkühlen eine gute.', 'Städte auf einem Kreis: Die beste Route ist einfach der Kreis.'],
          try: ['Lass 2-opt und Abkühlen auf dieselben Städte los und vergleiche die Endlängen.', 'Starte mit der Nächster-Nachbar-Route statt einer zufälligen.', 'Klicke, um während des Laufs Städte hinzuzufügen.'],
          real: 'Das Problem des Handlungsreisenden ist NP-schwer: Man kennt kein schnelles Verfahren, das immer die beste Route findet. Solche Methoden planen Lieferrouten, Bohrwege für Platinen und Teleskop-Beobachtungspläne.',
        },
      },
      hull: {
        en: {
          what: 'The smallest convex shape containing all the points — like a rubber band snapped around nails.',
          how: 'Gift wrapping starts at the leftmost point and repeatedly finds the point that has every other point on its left, like wrapping a ribbon around the nails. Monotone chain sorts the points from left to right, then builds the lower and upper edges, throwing away any point that would make a right turn. Both use the same test: the sign of a cross product says whether three points turn left or right.',
          eq: ['turn(a, b, c) = (b − a) × (c − a) = (bₓ − aₓ)(c_y − a_y) − (b_y − a_y)(cₓ − aₓ)'],
          look: ['Gift wrapping checking every point for every corner: its work grows with n × (number of corners).', 'Monotone chain backtracking when a new point makes a right turn.', 'The bell-shaped cloud having few corners compared with points spread over a disc.'],
          try: ['Compare the step counters of both methods for 500 points.', 'Click outside the hull to add a point and watch it change.', 'Record a clip of each method — it ends when the hull is complete.'],
          real: 'Convex hulls are used in collision detection for games and robots, in image processing, in mapping where animals roam, and as a first step in many other geometry algorithms.',
        },
        de: {
          what: 'Die kleinste konvexe Form, die alle Punkte enthält — wie ein Gummiband, das um Nägel schnappt.',
          how: 'Das Geschenkpapier-Verfahren beginnt beim Punkt ganz links und sucht immer wieder den Punkt, der alle anderen links von sich hat — als würde man ein Band um die Nägel wickeln. Die monotone Kette sortiert die Punkte von links nach rechts und baut dann den unteren und oberen Rand, wobei jeder Punkt wegfällt, der eine Rechtskurve machen würde. Beide nutzen denselben Test: Das Vorzeichen eines Kreuzprodukts sagt, ob drei Punkte links oder rechts abbiegen.',
          eq: ['Drehung(a, b, c) = (b − a) × (c − a) = (bₓ − aₓ)(c_y − a_y) − (b_y − a_y)(cₓ − aₓ)'],
          look: ['Das Geschenkpapier-Verfahren prüft für jede Ecke jeden Punkt: Die Arbeit wächst mit n × (Anzahl der Ecken).', 'Die monotone Kette geht zurück, wenn ein neuer Punkt eine Rechtskurve macht.', 'Die glockenförmige Wolke hat wenige Ecken im Vergleich zu Punkten in einer Kreisscheibe.'],
          try: ['Vergleiche die Schrittzähler beider Verfahren bei 500 Punkten.', 'Klicke außerhalb der Hülle, um einen Punkt hinzuzufügen, und sieh, wie sie sich ändert.', 'Nimm von jedem Verfahren einen Clip auf — er endet, wenn die Hülle fertig ist.'],
          real: 'Konvexe Hüllen braucht man für die Kollisionserkennung in Spielen und bei Robotern, in der Bildverarbeitung, um Streifgebiete von Tieren zu kartieren und als ersten Schritt vieler anderer Geometrie-Algorithmen.',
        },
      },
    },
    pi: {
      viewer: {
        en: {
          what: 'The digits of π — up to 100 000 of them, computed right here — shown as text, as letters, as coloured pixels, as a walk, as a circle of chords and as a tally.',
          how: 'The digits come from Machin’s formula, π = 16·arctan(1/5) − 4·arctan(1/239), worked out with whole numbers of 100 000 digits. Each view turns the same digits into a picture: in the walk every digit is a step in direction digit × 36°; in the circle each digit is joined to the one after it; RGB pixels read 3 digits each for red, green and blue. The letters are π written in base 26 (A = 0 … Z = 25), so they are π’s real digits in that base, not a code.',
          eq: ['π = 16·arctan(1/5) − 4·arctan(1/239)', 'arctan(x) = x − x³/3 + x⁵/5 − x⁷/7 + …', 'π in base 26 = 3.DRSQLOLYRTRODNLH…'],
          look: ['No pattern anywhere: the pixels look like static, the walk like a random walk, and every digit turns up about 10 % of the time.', 'Six 9s in a row at decimal place 762 — the “Feynman point”.', 'In the circle, all 100 possible pairs of neighbouring digits appearing about equally often.'],
          try: ['Search for your birthday (DDMM or DDMMYY). Four digits are almost always in the first 100 000, six digits about half the time.', 'Search for a word, such as PI, CAT or your name, in the base-26 letters.', 'Stream the walk from the start and record a clip of it.'],
          real: 'π has been computed to more than 100 trillion digits, mostly to test computers. Nobody has proved that π is “normal” — that every string of digits appears equally often — although all the evidence says so. NASA needs only 15 decimals for interplanetary navigation.',
        },
        de: {
          what: 'Die Ziffern von π — bis zu 100 000, direkt hier berechnet — als Text, als Buchstaben, als farbige Pixel, als Spaziergang, als Sehnenkreis und als Strichliste.',
          how: 'Die Ziffern stammen aus Machins Formel π = 16·arctan(1/5) − 4·arctan(1/239), gerechnet mit ganzen Zahlen von 100 000 Stellen. Jede Ansicht macht aus denselben Ziffern ein Bild: Beim Spaziergang ist jede Ziffer ein Schritt in Richtung Ziffer × 36°; im Kreis wird jede Ziffer mit der folgenden verbunden; RGB-Pixel lesen je 3 Ziffern für Rot, Grün und Blau. Die Buchstaben sind π zur Basis 26 (A = 0 … Z = 25) — also die echten Ziffern von π in dieser Basis, kein Code.',
          eq: ['π = 16·arctan(1/5) − 4·arctan(1/239)', 'arctan(x) = x − x³/3 + x⁵/5 − x⁷/7 + …', 'π zur Basis 26 = 3.DRSQLOLYRTRODNLH…'],
          look: ['Nirgends ein Muster: Die Pixel sehen aus wie Rauschen, der Spaziergang wie eine Irrfahrt, und jede Ziffer kommt in etwa 10 % der Fälle vor.', 'Sechs Neunen hintereinander ab Nachkommastelle 762 — der „Feynman-Punkt“.', 'Im Kreis kommen alle 100 möglichen Paare benachbarter Ziffern etwa gleich oft vor.'],
          try: ['Suche deinen Geburtstag (TTMM oder TTMMJJ). Vier Ziffern stehen fast immer in den ersten 100 000, sechs Ziffern etwa in der Hälfte der Fälle.', 'Suche ein Wort wie PI, KATZE oder deinen Namen in den Buchstaben zur Basis 26.', 'Lass den Spaziergang ab Start laufen und nimm einen Clip davon auf.'],
          real: 'π wurde auf über 100 Billionen Stellen berechnet, meist um Computer zu testen. Niemand hat bewiesen, dass π „normal“ ist — dass jede Ziffernfolge gleich oft vorkommt —, obwohl alles dafür spricht. Die NASA braucht für interplanetare Navigation nur 15 Nachkommastellen.',
        },
      },
    },
    prob: {
      dice: {
        en: {
          what: 'Dice being rolled again and again. The blue bars count how often each total came up; the orange marks are the exact probabilities.',
          how: 'With one die every face is equally likely. With two or more, totals in the middle can be made in more ways (7 = 1+6, 2+5, 3+4, …) so they come up more often. The probability of a total is the number of ways to make it divided by sⁿ, the number of possible rolls.',
          eq: ['two dice: P(7) = 6/36 = 1/6,   P(2) = P(12) = 1/36'],
          look: ['The bars wobbling at first, then fitting the orange marks more and more closely (law of large numbers).', 'The shape turning into a bell curve as you add more dice (central limit theorem).', 'The average total approaching n × (s + 1)/2.'],
          try: ['Compare one, two and five dice.', 'Click +1000 rolls a few times and watch the bars settle.', 'Switch to dice with more or fewer sides.'],
          real: 'Board games and casinos rely on these probabilities. The central limit theorem — sums of many random things look like a bell curve — is why measurement errors and heights are roughly normally distributed.',
        },
        de: {
          what: 'Würfel, die immer wieder geworfen werden. Die blauen Balken zählen, wie oft jede Augensumme kam; die orangen Marken sind die exakten Wahrscheinlichkeiten.',
          how: 'Mit einem Würfel ist jede Seite gleich wahrscheinlich. Mit zwei oder mehr lassen sich mittlere Summen auf mehr Arten bilden (7 = 1+6, 2+5, 3+4, …), deshalb kommen sie öfter vor. Die Wahrscheinlichkeit einer Summe ist die Zahl der Möglichkeiten, sie zu bilden, geteilt durch sⁿ, die Zahl aller Würfe.',
          eq: ['zwei Würfel: P(7) = 6/36 = 1/6,   P(2) = P(12) = 1/36'],
          look: ['Die Balken wackeln anfangs und passen dann immer besser zu den orangen Marken (Gesetz der großen Zahlen).', 'Mit mehr Würfeln wird die Form zur Glockenkurve (zentraler Grenzwertsatz).', 'Die mittlere Augensumme nähert sich n × (s + 1)/2.'],
          try: ['Vergleiche einen, zwei und fünf Würfel.', 'Klicke ein paar Mal auf +1000 Würfe und sieh, wie sich die Balken beruhigen.', 'Wechsle zu Würfeln mit mehr oder weniger Seiten.'],
          real: 'Brettspiele und Casinos beruhen auf diesen Wahrscheinlichkeiten. Der zentrale Grenzwertsatz — Summen vieler Zufallsgrößen sehen aus wie eine Glockenkurve — erklärt, warum Messfehler und Körpergrößen ungefähr normalverteilt sind.',
        },
      },
      coins: {
        en: {
          what: 'A coin being flipped, with the share of heads plotted against the number of flips. The shaded band is where the share should stay about 95 % of the time.',
          how: 'Each flip is heads with probability ½, independent of all the others. The share of heads approaches ½, and its typical distance from ½ shrinks like 1/√n — so the band narrows quickly at first and then slowly.',
          eq: ['95 % band: ½ ± 1.96 · ½/√n'],
          look: ['Wild swings for the first few dozen flips.', 'The share settling into the narrowing band.', 'Long runs of the same side: about log₂(n) in a row is normal.'],
          try: ['Reset several times and compare the first 50 flips.', 'Click +1000 flips and look at the longest run.', 'Before running, guess how long the longest run in 100 flips will be.'],
          real: 'People asked to write down a “random” sequence of heads and tails usually avoid long runs, which makes fake data easy to spot. Opinion polls use the same 1/√n rule: asking 4 times as many people halves the error.',
        },
        de: {
          what: 'Eine Münze wird geworfen, und der Anteil von Kopf wird über die Zahl der Würfe aufgetragen. Im schattierten Band sollte der Anteil etwa 95 % der Zeit bleiben.',
          how: 'Jeder Wurf zeigt mit Wahrscheinlichkeit ½ Kopf, unabhängig von allen anderen. Der Anteil von Kopf nähert sich ½, und sein typischer Abstand von ½ schrumpft wie 1/√n — das Band wird also erst schnell und dann langsam enger.',
          eq: ['95-%-Band: ½ ± 1,96 · ½/√n'],
          look: ['Wilde Ausschläge in den ersten paar Dutzend Würfen.', 'Der Anteil pendelt sich im enger werdenden Band ein.', 'Lange Serien derselben Seite: etwa log₂(n) hintereinander sind normal.'],
          try: ['Setze mehrmals zurück und vergleiche die ersten 50 Würfe.', 'Klicke auf +1000 Würfe und sieh dir die längste Serie an.', 'Rate vor dem Start, wie lang die längste Serie in 100 Würfen wird.'],
          real: 'Wer eine „zufällige“ Folge von Kopf und Zahl ausdenken soll, vermeidet meist lange Serien — so lassen sich erfundene Daten leicht erkennen. Umfragen folgen derselben 1/√n-Regel: Viermal so viele Befragte halbieren den Fehler.',
        },
      },
      galton: {
        en: {
          what: 'Balls dropping through rows of pegs into bins. The orange outline is the expected number in each bin.',
          how: 'At every peg a ball goes left or right with equal chance. The bin it lands in is the number of rights, so with n rows it is binomially distributed: there are C(n, k) paths to bin k, out of 2ⁿ. Many small random pushes add up to a bell curve.',
          eq: ['P(bin k) = C(n, k) / 2ⁿ'],
          look: ['The pile growing into a bell shape.', 'The outer bins staying almost empty: one path out of 2ⁿ leads there.', 'With more rows, a wider bell that looks more and more like the normal distribution.'],
          try: ['Change the number of rows.', 'Click +1000 balls to fill the bins at once.', 'Record a clip of the board filling up.'],
          real: 'Francis Galton built this board in 1873 to show how the normal distribution arises. It is the reason test scores, measurement errors and many natural quantities follow bell curves.',
        },
        de: {
          what: 'Kugeln fallen durch Reihen von Nägeln in Fächer. Die orange Linie ist die erwartete Zahl in jedem Fach.',
          how: 'An jedem Nagel geht eine Kugel mit gleicher Chance nach links oder rechts. Das Fach ist die Zahl der Rechtsschritte, also bei n Reihen binomialverteilt: Es gibt C(n, k) Wege in Fach k von 2ⁿ insgesamt. Viele kleine Zufallsstöße ergeben zusammen eine Glockenkurve.',
          eq: ['P(Fach k) = C(n, k) / 2ⁿ'],
          look: ['Der Haufen wächst zu einer Glockenform.', 'Die äußeren Fächer bleiben fast leer: Nur ein Weg von 2ⁿ führt dorthin.', 'Mit mehr Reihen eine breitere Glocke, die immer mehr wie die Normalverteilung aussieht.'],
          try: ['Ändere die Zahl der Reihen.', 'Klicke auf +1000 Kugeln, um die Fächer auf einmal zu füllen.', 'Nimm einen Clip auf, wie sich das Brett füllt.'],
          real: 'Francis Galton baute dieses Brett 1873, um zu zeigen, wie die Normalverteilung entsteht. Deshalb folgen Testergebnisse, Messfehler und viele natürliche Größen Glockenkurven.',
        },
      },
      pi: {
        en: {
          what: 'Random points thrown into a square with a quarter circle drawn in it, and the estimate of π they give.',
          how: 'The quarter circle of radius 1 has area π/4 and the square has area 1, so a random point lands inside with probability π/4. Four times the share inside is therefore an estimate of π. Using randomness to compute something like this is called the Monte Carlo method.',
          eq: ['π ≈ 4 × (points inside) / (all points)'],
          look: ['The estimate jumping about at first, then closing in on 3.14159…', 'How slowly it improves: 100 times as many points for each extra correct digit.'],
          try: ['Click +10 000 points several times and see how many digits are right.', 'Reset and compare runs.'],
          real: 'Monte Carlo methods were developed for the atomic bomb project in the 1940s and named after the casino. Today they price financial options, render realistic light in films and simulate particle physics.',
        },
        de: {
          what: 'Zufällige Punkte in einem Quadrat mit einem Viertelkreis darin, und die Schätzung von π, die sie liefern.',
          how: 'Der Viertelkreis mit Radius 1 hat die Fläche π/4, das Quadrat die Fläche 1, also landet ein zufälliger Punkt mit Wahrscheinlichkeit π/4 innen. Viermal der Anteil innen ist deshalb eine Schätzung für π. Etwas mit Zufall zu berechnen, nennt man Monte-Carlo-Methode.',
          eq: ['π ≈ 4 × (Punkte innen) / (alle Punkte)'],
          look: ['Die Schätzung springt anfangs herum und nähert sich dann 3,14159…', 'Wie langsam sie besser wird: für jede weitere richtige Stelle 100-mal so viele Punkte.'],
          try: ['Klicke mehrmals auf +10 000 Punkte und sieh, wie viele Stellen stimmen.', 'Setze zurück und vergleiche die Durchläufe.'],
          real: 'Monte-Carlo-Methoden wurden in den 1940er-Jahren für das Atombombenprojekt entwickelt und nach dem Casino benannt. Heute bewerten sie Finanzoptionen, berechnen realistisches Licht in Filmen und simulieren Teilchenphysik.',
        },
      },
      monty: {
        en: {
          what: 'The game-show puzzle: a car behind one door, goats behind the others. Play it yourself or simulate thousands of rounds.',
          how: 'Your first pick is right with probability 1/n. The host knows where the car is and opens every other door except one, always showing goats. If your first pick was wrong — which happens with probability (n − 1)/n — the car must be behind the one closed door left. So switching wins exactly when your first guess was wrong.',
          eq: ['3 doors: stay wins 1/3, switch wins 2/3', 'n doors: stay 1/n, switch (n − 1)/n'],
          look: ['The switch win rate settling near 2/3 and the stay rate near 1/3.', 'With more doors the advantage of switching becoming obvious.'],
          try: ['Play several rounds yourself, always staying, then always switching.', 'Set 10 doors: would you stay with your first pick now?', 'Simulate +1000 rounds.'],
          real: 'When Marilyn vos Savant published the answer in 1990, thousands of readers — including mathematicians — wrote in to say she was wrong. The puzzle shows how badly our intuition handles conditional probability.',
        },
        de: {
          what: 'Das Rätsel aus der Spielshow: hinter einer Tür ein Auto, hinter den anderen Ziegen. Spiel selbst oder simuliere Tausende Runden.',
          how: 'Deine erste Wahl ist mit Wahrscheinlichkeit 1/n richtig. Der Moderator weiß, wo das Auto ist, und öffnet alle anderen Türen bis auf eine, immer mit Ziegen. War deine erste Wahl falsch — mit Wahrscheinlichkeit (n − 1)/n —, muss das Auto hinter der einen übrigen geschlossenen Tür sein. Wechseln gewinnt also genau dann, wenn dein erster Tipp falsch war.',
          eq: ['3 Türen: Bleiben gewinnt 1/3, Wechseln 2/3', 'n Türen: Bleiben 1/n, Wechseln (n − 1)/n'],
          look: ['Die Gewinnquote beim Wechseln pendelt sich bei 2/3 ein, beim Bleiben bei 1/3.', 'Mit mehr Türen wird der Vorteil des Wechselns offensichtlich.'],
          try: ['Spiel selbst ein paar Runden, erst immer bleibend, dann immer wechselnd.', 'Stell 10 Türen ein: Würdest du jetzt bei deiner ersten Wahl bleiben?', 'Simuliere +1000 Runden.'],
          real: 'Als Marilyn vos Savant die Lösung 1990 veröffentlichte, schrieben ihr Tausende Leser — auch Mathematiker —, sie liege falsch. Das Rätsel zeigt, wie schlecht unsere Intuition mit bedingten Wahrscheinlichkeiten umgeht.',
        },
      },
      bday: {
        en: {
          what: 'Random groups of people, checked for a shared birthday. The orange curve is the exact probability for each group size; the blue dot is the simulation.',
          how: 'It is easier to work out the chance that all birthdays are different: the second person must miss one day, the third two days, and so on. One minus that is the chance of at least one match. It grows fast because the number of pairs grows like n²/2.',
          eq: ['P(match) = 1 − (365 · 364 · … · (365 − n + 1)) / 365ⁿ', '23 people: 253 pairs, P ≈ 50.7 %'],
          look: ['The curve crossing 50 % at just 23 people.', 'Above 99 % at 57 people.', 'The highlighted shared dates in the last group.'],
          try: ['Set 23 people and simulate +1000 groups.', 'Before you look, guess how many people give a 90 % chance.'],
          real: 'The same maths powers the “birthday attack” in cryptography: finding two inputs with the same hash takes only about the square root of the number of possible hashes.',
        },
        de: {
          what: 'Zufällige Gruppen von Menschen, geprüft auf einen gemeinsamen Geburtstag. Die orange Kurve ist die exakte Wahrscheinlichkeit für jede Gruppengröße, der blaue Punkt die Simulation.',
          how: 'Leichter berechnet man die Chance, dass alle Geburtstage verschieden sind: Die zweite Person muss einen Tag vermeiden, die dritte zwei und so weiter. Eins minus das ist die Chance auf mindestens einen Treffer. Sie wächst schnell, weil die Zahl der Paare wie n²/2 wächst.',
          eq: ['P(Treffer) = 1 − (365 · 364 · … · (365 − n + 1)) / 365ⁿ', '23 Personen: 253 Paare, P ≈ 50,7 %'],
          look: ['Die Kurve überschreitet schon bei 23 Personen 50 %.', 'Bei 57 Personen über 99 %.', 'Die hervorgehobenen gemeinsamen Daten in der letzten Gruppe.'],
          try: ['Stell 23 Personen ein und simuliere +1000 Gruppen.', 'Rate, bevor du hinsiehst, wie viele Personen eine Chance von 90 % ergeben.'],
          real: 'Dieselbe Mathematik steckt im „Geburtstagsangriff“ der Kryptographie: Zwei Eingaben mit demselben Hashwert findet man schon nach etwa der Wurzel aus der Zahl möglicher Hashwerte.',
        },
      },
      walk: {
        en: {
          what: 'Walkers taking random unit steps, along a line or on a grid, with their paths and how far they get.',
          how: 'Each step goes in a random direction, so on average the walker stays where it started. But the steps don’t cancel exactly: the squared distance grows by one with every step on average, so the typical distance after n steps is √n. To get 10 times as far takes 100 times as many steps.',
          eq: ['E[distance²] = n,   typical distance ≈ √n'],
          look: ['Some walkers wandering far while others hang around the start.', 'The measured mean squared distance following the straight line n.', 'In 1D every walker coming back to the start again and again.'],
          try: ['Compare 1D and 2D.', 'Use many walkers and click +1000 steps.', 'Record a clip of the 2D walkers spreading out.'],
          real: 'Random walks model diffusion (a drop of ink spreading in water), Brownian motion, stock prices and how animals search for food. Pólya proved that a walker on a 1D or 2D grid always returns home, but in 3D it may be lost for ever.',
        },
        de: {
          what: 'Wanderer, die zufällige Einheitsschritte machen, auf einer Geraden oder im Gitter, mit ihren Wegen und wie weit sie kommen.',
          how: 'Jeder Schritt geht in eine zufällige Richtung, im Mittel bleibt der Wanderer also, wo er gestartet ist. Aber die Schritte heben sich nicht genau auf: Das Quadrat des Abstands wächst im Mittel mit jedem Schritt um eins, also ist der typische Abstand nach n Schritten √n. Um 10-mal so weit zu kommen, braucht man 100-mal so viele Schritte.',
          eq: ['E[Abstand²] = n,   typischer Abstand ≈ √n'],
          look: ['Manche Wanderer kommen weit, andere bleiben in der Nähe des Starts.', 'Die gemessene mittlere quadratische Entfernung folgt der Geraden n.', 'In 1D kehrt jeder Wanderer immer wieder zum Start zurück.'],
          try: ['Vergleiche 1D und 2D.', 'Nimm viele Wanderer und klicke auf +1000 Schritte.', 'Nimm einen Clip auf, wie sich die Wanderer in 2D ausbreiten.'],
          real: 'Irrfahrten beschreiben Diffusion (ein Tropfen Tinte, der sich im Wasser verteilt), Brownsche Bewegung, Aktienkurse und wie Tiere nach Futter suchen. Pólya bewies, dass ein Wanderer im 1D- oder 2D-Gitter immer heimkehrt — in 3D kann er für immer verloren gehen.',
        },
      },
      markov: {
        en: {
          what: 'A random process hopping between a few states, drawn as a diagram, with bars for how much time it spends in each state.',
          how: 'Row i of the matrix gives the probabilities of moving from state i to each state next. Only the current state matters, not how you got there. For most chains the share of time in each state settles to the stationary distribution π, which does not depend on where you start and solves πP = π.',
          eq: ['πP = π,   Σ πᵢ = 1'],
          look: ['The blue bars approaching the stationary values, whatever the start.', 'The cycle preset never settling down: it is periodic.', 'In the web surfer, popular pages collecting most of the visits.'],
          try: ['Edit a row of the matrix (each row must add up to 1).', 'Compare Weather and Mood, then the periodic cycle.', 'Click +1000 steps and compare the bars with the stationary distribution.'],
          real: 'Google’s original PageRank was the stationary distribution of a random web surfer. Markov chains also power predictive text, speech recognition, queueing models and simulations in physics and statistics.',
        },
        de: {
          what: 'Ein Zufallsprozess, der zwischen wenigen Zuständen springt, als Diagramm gezeichnet, mit Balken dafür, wie viel Zeit er in jedem Zustand verbringt.',
          how: 'Zeile i der Matrix gibt die Wahrscheinlichkeiten an, von Zustand i in jeden Zustand zu wechseln. Nur der aktuelle Zustand zählt, nicht der Weg dorthin. Bei den meisten Ketten pendelt sich der Zeitanteil in jedem Zustand auf die stationäre Verteilung π ein, die nicht vom Start abhängt und πP = π erfüllt.',
          eq: ['πP = π,   Σ πᵢ = 1'],
          look: ['Die blauen Balken nähern sich den stationären Werten, egal wo es losgeht.', 'Die Kreislauf-Vorlage kommt nie zur Ruhe: Sie ist periodisch.', 'Beim Websurfer sammeln beliebte Seiten die meisten Besuche.'],
          try: ['Bearbeite eine Zeile der Matrix (jede Zeile muss 1 ergeben).', 'Vergleiche Wetter und Stimmung, dann den periodischen Kreislauf.', 'Klicke auf +1000 Schritte und vergleiche die Balken mit der stationären Verteilung.'],
          real: 'Googles ursprünglicher PageRank war die stationäre Verteilung eines zufälligen Websurfers. Markow-Ketten stecken auch in Wortvorschlägen, Spracherkennung, Warteschlangenmodellen und Simulationen in Physik und Statistik.',
        },
      },
    },
  };

  function card(d, lang, close) {
    const h = HEAD[lang], x = d[lang];
    const list = (items) => el('ul', {}, items.map((t) => el('li', {}, t)));
    return el('div', { class: 'xp-' + lang, lang },
      el('button', { type: 'button', class: 'icon xp-close', title: h.close, onclick: close }, '×'),
      el('h4', {}, h.what), el('p', {}, x.what),
      el('h4', {}, h.how), el('p', {}, x.how),
      x.eq ? el('div', { class: 'xp-eq' }, x.eq.map((e) => el('div', {}, e))) : null,
      el('div', { class: 'xp-cols' },
        el('div', {}, el('h4', {}, h.look), list(x.look)),
        el('div', {}, el('h4', {}, h.try), list(x.try))),
      x.real ? el('div', { class: 'xp-real' }, el('h4', {}, h.real), el('p', {}, x.real)) : null);
  }

  function setOpen(v) {
    open = v;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* not saved */ }
    views.forEach((f) => f());
  }

  function attach(group) {
    let key = null;
    const box = el('div', { class: 'xp', hidden: true, 'data-no-i18n': '' });
    const button = U.el('button', { type: 'button', class: 'xp-btn', title: 'What is going on here, and why?', onclick: () => setOpen(!open) }, 'ⓘ Explain');
    const render = () => {
      const d = DATA[group][key];
      button.hidden = !d;
      button.classList.toggle('on', open);
      box.hidden = !open || !d;
      if (!box.hidden && box.dataset.key !== key) {
        box.dataset.key = key;
        box.replaceChildren(card(d, 'en', () => setOpen(false)), card(d, 'de', () => setOpen(false)));
      }
    };
    views.push(render);
    return { button, box, show(k) { key = k; render(); } };
  }

  return { attach, DATA };
})();
