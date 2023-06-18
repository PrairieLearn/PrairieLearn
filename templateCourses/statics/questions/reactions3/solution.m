clear all
Fj = 768;
Fk = 711;
a = 2;
b = 7;
alpha = 21;
%Sum forces
fx = -Fj*cosd(alpha);
fy = -Fj*sind(alpha) + Fk;

fo = [fx fy 0]

%Sum moments
mfj = cross([-a b 0],[Fj*(cosd(alpha)) Fj*sind(alpha) 0])
mfk = [0 0 (Fk*a)]
m0 = -(mfj + mfk)