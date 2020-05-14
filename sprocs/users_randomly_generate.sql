DROP FUNCTION IF EXISTS users_randomly_generate(int, bigint);

CREATE OR REPLACE FUNCTION
    users_randomly_generate(
        count int,
        course_instance_id bigint DEFAULT NULL
    ) RETURNS SETOF users
AS $$
DECLARE
    surnames text[] := ARRAY['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King', 'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Gonzalez', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward', 'Torres', 'Peterson', 'Gray', 'Ramirez', 'James', 'Watson', 'Brooks', 'Kelly', 'Sanders', 'Price', 'Bennett', 'Wood', 'Barnes', 'Ross', 'Henderson', 'Coleman', 'Jenkins', 'Perry', 'Powell', 'Long', 'Patterson', 'Hughes', 'Flores', 'Washington', 'Butler', 'Simmons', 'Foster', 'Gonzales', 'Bryant', 'Alexander', 'Russell', 'Griffin', 'Diaz', 'Hayes', 'Myers', 'Ford', 'Hamilton', 'Graham', 'Sullivan', 'Wallace', 'Woods', 'Cole', 'West', 'Jordan', 'Owens', 'Reynolds', 'Fisher', 'Ellis', 'Harrison', 'Gibson', 'McDonald', 'Cruz', 'Marshall', 'Ortiz', 'Gomez', 'Murray', 'Freeman', 'Wells', 'Webb', 'Simpson', 'Stevens', 'Tucker', 'Porter', 'Hunter', 'Hicks', 'Crawford', 'Henry', 'Boyd', 'Mason', 'Morales', 'Kennedy', 'Warren', 'Dixon', 'Ramos', 'Reyes', 'Burns', 'Gordon', 'Shaw', 'Holmes', 'Rice', 'Robertson', 'Hunt', 'Black', 'Daniels', 'Palmer', 'Mills', 'Nichols', 'Grant', 'Knight', 'Ferguson', 'Rose', 'Stone', 'Hawkins', 'Dunn', 'Perkins', 'Hudson', 'Spencer', 'Gardner', 'Stephens', 'Payne', 'Pierce', 'Berry', 'Matthews', 'Arnold', 'Wagner', 'Willis', 'Ray', 'Watkins', 'Olson', 'Carroll', 'Duncan', 'Snyder', 'Hart', 'Cunningham', 'Bradley', 'Lane', 'Andrews', 'Ruiz', 'Harper', 'Fox', 'Riley', 'Armstrong', 'Carpenter', 'Weaver', 'Greene', 'Lawrence', 'Elliott', 'Chavez', 'Sims', 'Austin', 'Peters', 'Kelley', 'Franklin', 'Lawson', 'Fields', 'Gutierrez', 'Ryan', 'Schmidt', 'Carr', 'Vasquez', 'Castillo', 'Wheeler', 'Chapman', 'Oliver', 'Montgomery', 'Richards', 'Williamson', 'Johnston', 'Banks', 'Meyer', 'Bishop', 'McCoy', 'Howell', 'Alvarez', 'Morrison', 'Hansen', 'Fernandez', 'Garza', 'Harvey', 'Little', 'Burton', 'Stanley', 'Nguyen', 'George', 'Jacobs', 'Reid', 'Kim', 'Fuller', 'Lynch', 'Dean', 'Gilbert', 'Garrett', 'Romero', 'Welch', 'Larson', 'Frazier', 'Burke', 'Hanson', 'Day', 'Mendoza', 'Moreno', 'Bowman', 'Medina', 'Fowler', 'Brewer', 'Hoffman', 'Carlson', 'Silva', 'Pearson', 'Holland', 'Douglas', 'Fleming', 'Jensen', 'Vargas', 'Byrd', 'Davidson', 'Hopkins', 'May', 'Terry', 'Herrera', 'Wade', 'Soto', 'Walters', 'Curtis', 'Neal', 'Caldwell', 'Lowe', 'Jennings', 'Barnett', 'Graves', 'Jimenez', 'Horton', 'Shelton', 'Barrett', 'Obrien', 'Castro', 'Sutton', 'Gregory', 'McKinney', 'Lucas', 'Miles', 'Craig', 'Rodriquez', 'Chambers', 'Holt', 'Lambert', 'Fletcher', 'Watts', 'Bates', 'Hale', 'Rhodes', 'Pena', 'Beck', 'Newman', 'Haynes', 'McDaniel', 'Mendez', 'Bush', 'Vaughn', 'Parks', 'Dawson', 'Santiago', 'Norris', 'Hardy', 'Love', 'Steele', 'Curry', 'Powers', 'Schultz', 'Barker', 'Guzman', 'Page', 'Munoz', 'Ball', 'Keller', 'Chandler', 'Weber', 'Leonard', 'Walsh', 'Lyons', 'Ramsey', 'Wolfe', 'Schneider', 'Mullins', 'Benson', 'Sharp', 'Bowen', 'Daniel', 'Barber', 'Cummings', 'Hines', 'Baldwin', 'Griffith', 'Valdez', 'Hubbard', 'Salazar', 'Reeves', 'Warner', 'Stevenson', 'Burgess', 'Santos', 'Tate', 'Cross', 'Garner', 'Mann', 'Mack', 'Moss', 'Thornton', 'Dennis', 'McGee', 'Farmer', 'Delgado', 'Aguilar', 'Vega', 'Glover', 'Manning', 'Cohen', 'Harmon', 'Rodgers', 'Robbins', 'Newton', 'Todd', 'Blair', 'Higgins', 'Ingram', 'Reese', 'Cannon', 'Strickland', 'Townsend', 'Potter', 'Goodwin', 'Walton', 'Rowe', 'Hampton', 'Ortega', 'Patton', 'Swanson', 'Joseph', 'Francis', 'Goodman', 'Maldonado', 'Yates', 'Becker', 'Erickson', 'Hodges', 'Rios', 'Conner', 'Adkins', 'Webster', 'Norman', 'Malone', 'Hammond', 'Flowers', 'Cobb', 'Moody', 'Quinn', 'Blake', 'Maxwell', 'Pope', 'Floyd', 'Osborne', 'Paul', 'McCarthy', 'Guerrero', 'Lindsey', 'Estrada', 'Sandoval', 'Gibbs', 'Tyler', 'Gross', 'Fitzgerald', 'Stokes', 'Doyle', 'Sherman', 'Saunders', 'Wise', 'Colon', 'Gill', 'Alvarado', 'Greer', 'Padilla', 'Simon', 'Waters', 'Nunez', 'Ballard', 'Schwartz', 'McBride', 'Houston', 'Christensen', 'Klein', 'Pratt', 'Briggs', 'Parsons', 'McLaughlin', 'Zimmerman', 'French', 'Buchanan', 'Moran', 'Copeland', 'Roy', 'Pittman', 'Brady', 'McCormick', 'Holloway', 'Brock', 'Poole', 'Frank', 'Logan', 'Owen', 'Bass', 'Marsh', 'Drake', 'Wong', 'Jefferson', 'Park', 'Morton', 'Abbott', 'Sparks', 'Patrick', 'Norton', 'Huff', 'Clayton', 'Massey', 'Lloyd', 'Figueroa', 'Carson', 'Bowers', 'Roberson', 'Barton', 'Tran', 'Lamb', 'Harrington', 'Casey', 'Boone', 'Cortez', 'Clarke', 'Mathis', 'Singleton', 'Wilkins', 'Cain', 'Bryan', 'Underwood', 'Hogan', 'McKenzie', 'Collier', 'Luna', 'Phelps', 'McGuire', 'Allison', 'Bridges', 'Wilkerson', 'Nash', 'Summers', 'Atkins', 'Wilcox', 'Pitts', 'Conley', 'Marquez', 'Burnett', 'Richard', 'Cochran', 'Chase', 'Davenport', 'Hood', 'Gates', 'Clay', 'Ayala', 'Sawyer', 'Roman', 'Vazquez', 'Dickerson', 'Hodge', 'Acosta', 'Flynn', 'Espinoza', 'Nicholson', 'Monroe', 'Wolf', 'Morrow', 'Kirk', 'Randall', 'Anthony', 'Whitaker', 'Oconnor', 'Skinner', 'Ware', 'Molina', 'Kirby', 'Huffman', 'Bradford', 'Charles', 'Gilmore', 'Dominguez', 'Oneal', 'Bruce', 'Lang', 'Combs', 'Kramer', 'Heath', 'Hancock', 'Gallagher', 'Gaines', 'Shaffer', 'Short', 'Wiggins', 'Mathews', 'McClain', 'Fischer', 'Wall', 'Small', 'Melton', 'Hensley', 'Bond', 'Dyer', 'Cameron', 'Grimes', 'Contreras', 'Christian', 'Wyatt', 'Baxter', 'Snow', 'Mosley', 'Shepherd', 'Larsen', 'Hoover', 'Beasley', 'Glenn', 'Petersen', 'Whitehead', 'Meyers', 'Keith', 'Garrison', 'Vincent', 'Shields', 'Horn', 'Savage', 'Olsen', 'Schroeder', 'Hartman', 'Woodard', 'Mueller', 'Kemp', 'Deleon', 'Booth', 'Patel', 'Calhoun', 'Wiley', 'Eaton', 'Cline', 'Navarro', 'Harrell', 'Lester', 'Humphrey', 'Parrish', 'Duran', 'Hutchinson', 'Hess', 'Dorsey', 'Bullock', 'Robles', 'Beard', 'Dalton', 'Avila', 'Vance', 'Rich', 'Blackwell', 'York', 'Johns', 'Blankenship', 'Trevino', 'Salinas', 'Campos', 'Pruitt', 'Moses', 'Callahan', 'Golden', 'Montoya', 'Hardin', 'Guerra', 'McDowell', 'Carey', 'Stafford', 'Gallegos', 'Henson', 'Wilkinson', 'Booker', 'Merritt', 'Miranda', 'Atkinson', 'Orr', 'Decker', 'Hobbs', 'Preston', 'Tanner', 'Knox', 'Pacheco', 'Stephenson', 'Glass', 'Rojas', 'Serrano', 'Marks', 'Hickman', 'English', 'Sweeney', 'Strong', 'Prince', 'McClure', 'Conway', 'Walter', 'Roth', 'Maynard', 'Farrell', 'Lowery', 'Hurst', 'Nixon', 'Weiss', 'Trujillo', 'Ellison', 'Sloan', 'Juarez', 'Winters', 'McLean', 'Randolph', 'Leon', 'Boyer', 'Villarreal', 'McCall', 'Gentry', 'Carrillo', 'Kent', 'Ayers', 'Lara', 'Shannon', 'Sexton', 'Pace', 'Hull', 'Leblanc', 'Browning', 'Velasquez', 'Leach', 'Chang', 'House', 'Sellers', 'Herring', 'Noble', 'Foley', 'Bartlett', 'Mercado', 'Landry', 'Durham', 'Walls', 'Barr', 'McKee', 'Bauer', 'Rivers', 'Everett', 'Bradshaw', 'Pugh', 'Velez', 'Rush', 'Estes', 'Dodson', 'Morse', 'Sheppard', 'Weeks', 'Camacho', 'Bean', 'Barron', 'Livingston', 'Middleton', 'Spears', 'Branch', 'Blevins', 'Chen', 'Kerr', 'McConnell', 'Hatfield', 'Harding', 'Ashley', 'Solis', 'Herman', 'Frost', 'Giles', 'Blackburn', 'William', 'Pennington', 'Woodward', 'Finley', 'McIntosh', 'Koch', 'Best', 'Solomon', 'McCullough', 'Dudley', 'Nolan', 'Blanchard', 'Rivas', 'Brennan', 'Mejia', 'Kane', 'Benton', 'Joyce', 'Buckley', 'Haley', 'Valentine', 'Maddox', 'Russo', 'McKnight', 'Buck', 'Moon', 'McMillan', 'Crosby', 'Berg', 'Dotson', 'Mays', 'Roach', 'Church', 'Chan', 'Richmond', 'Meadows', 'Faulkner', 'Oneill', 'Knapp', 'Kline', 'Barry', 'Ochoa', 'Jacobson', 'Gay', 'Avery', 'Hendricks', 'Horne', 'Shepard', 'Hebert', 'Cherry', 'Cardenas', 'McIntyre', 'Whitney', 'Waller', 'Holman', 'Donaldson', 'Cantu', 'Terrell', 'Morin', 'Gillespie', 'Fuentes', 'Tillman', 'Sanford', 'Bentley', 'Peck', 'Key', 'Salas', 'Rollins', 'Gamble', 'Dickson', 'Battle', 'Santana', 'Cabrera', 'Cervantes', 'Howe', 'Hinton', 'Hurley', 'Spence', 'Zamora', 'Yang', 'McNeil', 'Suarez', 'Case', 'Petty', 'Gould', 'McFarland', 'Sampson', 'Carver', 'Bray', 'Rosario', 'Macdonald', 'Stout', 'Hester', 'Melendez', 'Dillon', 'Farley', 'Hopper', 'Galloway', 'Potts', 'Bernard', 'Joyner', 'Stein', 'Aguirre', 'Osborn', 'Mercer', 'Bender', 'Franco', 'Rowland', 'Sykes', 'Benjamin', 'Travis', 'Pickett', 'Crane', 'Sears', 'Mayo', 'Dunlap', 'Hayden', 'Wilder', 'McKay', 'Coffey', 'McCarty', 'Ewing', 'Cooley', 'Vaughan', 'Bonner', 'Cotton', 'Holder', 'Stark', 'Ferrell', 'Cantrell', 'Fulton', 'Lynn', 'Lott', 'Calderon', 'Rosa', 'Pollard', 'Hooper', 'Burch', 'Mullen', 'Fry', 'Riddle', 'Levy', 'David', 'Duke', 'Odonnell', 'Guy', 'Michael', 'Britt', 'Frederick', 'Daugherty', 'Berger', 'Dillard', 'Alston', 'Jarvis', 'Frye', 'Riggs', 'Chaney', 'Odom', 'Duffy', 'Fitzpatrick', 'Valenzuela', 'Merrill', 'Mayer', 'Alford', 'McPherson', 'Acevedo', 'Donovan', 'Barrera', 'Albert', 'Cote', 'Reilly', 'Compton', 'Raymond', 'Mooney', 'McGowan', 'Craft', 'Cleveland', 'Clemons', 'Wynn', 'Nielsen', 'Baird', 'Stanton', 'Snider', 'Rosales', 'Bright', 'Witt', 'Stuart', 'Hays', 'Holden', 'Rutledge', 'Kinney', 'Clements', 'Castaneda', 'Slater', 'Hahn', 'Emerson', 'Conrad', 'Burks', 'Delaney', 'Pate', 'Lancaster', 'Sweet', 'Justice', 'Tyson', 'Sharpe', 'Whitfield', 'Talley', 'Macias', 'Irwin', 'Burris', 'Ratliff', 'McCray', 'Madden', 'Kaufman', 'Beach', 'Goff', 'Cash', 'Bolton', 'McFadden', 'Levine', 'Good', 'Byers', 'Kirkland', 'Kidd', 'Workman', 'Carney', 'Dale', 'McLeod', 'Holcomb', 'England', 'Finch', 'Head', 'Burt', 'Hendrix', 'Sosa', 'Haney', 'Franks', 'Sargent', 'Nieves', 'Downs', 'Rasmussen', 'Bird', 'Hewitt', 'Lindsay', 'Le', 'Foreman', 'Valencia', 'Oneil', 'Delacruz', 'Vinson', 'Dejesus', 'Hyde', 'Forbes', 'Gilliam', 'Guthrie', 'Wooten', 'Huber', 'Barlow', 'Boyle', 'McMahon', 'Buckner', 'Rocha', 'Puckett', 'Langley', 'Knowles', 'Cooke', 'Velazquez', 'Whitley', 'Noel', 'Vang'];

    boy_names text[] := ARRAY['Nathaniel', 'Jeremiah', 'Sebastian', 'Alejandro', 'Cristian', 'Francisco', 'Giovanni', 'Emmanuel', 'Fernando', 'Johnathan', 'Leonardo', 'Harrison', 'Dominick', 'Mitchell', 'Jacob', 'Michael', 'Joshua', 'Matthew', 'Ethan', 'Andrew', 'Daniel', 'Anthony', 'Christopher', 'Joseph', 'William', 'Alexander', 'Ryan', 'David', 'Nicholas', 'Christian', 'Benjamin', 'Tyler', 'James', 'John', 'Jonathan', 'Nathan', 'Samuel', 'Noah', 'Dylan', 'Logan', 'Brandon', 'Gabriel', 'Zachary', 'Jose', 'Elijah', 'Angel', 'Kevin', 'Jack', 'Caleb', 'Justin', 'Austin', 'Evan', 'Robert', 'Thomas', 'Luke', 'Mason', 'Aidan', 'Jackson', 'Isaiah', 'Jordan', 'Gavin', 'Connor', 'Aiden', 'Isaac', 'Jason', 'Cameron', 'Hunter', 'Jayden', 'Juan', 'Charles', 'Aaron', 'Lucas', 'Luis', 'Owen', 'Landon', 'Diego', 'Brian', 'Adam', 'Adrian', 'Kyle', 'Eric', 'Ian', 'Carlos', 'Alex', 'Bryan', 'Jesus', 'Julian', 'Sean', 'Carter', 'Hayden', 'Cole', 'Brayden', 'Wyatt', 'Chase', 'Steven', 'Timothy', 'Dominic', 'Xavier', 'Jaden', 'Jesse', 'Devin', 'Seth', 'Antonio', 'Richard', 'Miguel', 'Colin', 'Cody', 'Caden', 'Blake', 'Carson', 'Kaden', 'Jake', 'Henry', 'Liam', 'Victor', 'Riley', 'Ashton', 'Patrick', 'Bryce', 'Brady', 'Vincent', 'Trevor', 'Tristan', 'Mark', 'Jeremy', 'Oscar', 'Marcus', 'Jorge', 'Parker', 'Kaleb', 'Cooper', 'Kenneth', 'Garrett', 'Joel', 'Ivan', 'Josiah', 'Alan', 'Conner', 'Eduardo', 'Paul', 'Tanner', 'Braden', 'Alexis', 'Edward', 'Omar', 'Nicolas', 'Jared', 'Peyton', 'George', 'Maxwell', 'Collin', 'Nolan', 'Preston', 'Stephen', 'Ayden', 'Gage', 'Levi', 'Dakota', 'Micah', 'Eli', 'Manuel', 'Grant', 'Colton', 'Damian', 'Ricardo', 'Andres', 'Peter', 'Malachi', 'Cesar', 'Javier', 'Max', 'Hector', 'Edgar', 'Shane', 'Ty', 'Jeffrey', 'Bradley', 'Derek', 'Travis', 'Brendan', 'Shawn', 'Edwin', 'Spencer', 'Mario', 'Dalton', 'Erick', 'Erik', 'Jonah', 'Donovan', 'Wesley', 'Elias', 'Marco', 'Trenton', 'Devon', 'Brody', 'Abraham', 'Jaylen', 'Bryson', 'Josue', 'Sergio', 'Drew', 'Damien', 'Raymond', 'Andy', 'Dillon', 'Gregory', 'Roberto', 'Roman', 'Martin', 'Andre', 'Jace', 'Oliver', 'Miles', 'Jalen', 'Corey', 'Avery', 'Clayton', 'Pedro', 'Israel', 'Calvin', 'Colby', 'Dawson', 'Cayden', 'Jaiden', 'Taylor', 'Landen', 'Troy', 'Julio', 'Trey', 'Jaxon', 'Rafael', 'Dustin', 'Ruben', 'Camden', 'Frank', 'Scott', 'Zane', 'Payton', 'Kai', 'Keegan', 'Skyler', 'Brett', 'Johnny', 'Griffin', 'Marcos', 'Derrick', 'Drake', 'Raul', 'Kaiden', 'Gerardo'];

    girl_names text[] := ARRAY['Emily', 'Emma', 'Madison', 'Abigail', 'Olivia', 'Isabella', 'Hannah', 'Samantha', 'Ava', 'Ashley', 'Sophia', 'Elizabeth', 'Alexis', 'Grace', 'Sarah', 'Alyssa', 'Mia', 'Natalie', 'Chloe', 'Brianna', 'Lauren', 'Ella', 'Anna', 'Taylor', 'Kayla', 'Hailey', 'Jessica', 'Victoria', 'Jasmine', 'Sydney', 'Julia', 'Destiny', 'Morgan', 'Kaitlyn', 'Savannah', 'Katherine', 'Alexandra', 'Rachel', 'Lily', 'Megan', 'Kaylee', 'Jennifer', 'Angelina', 'Makayla', 'Allison', 'Brooke', 'Maria', 'Trinity', 'Lillian', 'Mackenzie', 'Faith', 'Sofia', 'Riley', 'Haley', 'Gabrielle', 'Nicole', 'Kylie', 'Katelyn', 'Zoe', 'Paige', 'Gabriella', 'Jenna', 'Kimberly', 'Stephanie', 'Alexa', 'Avery', 'Andrea', 'Leah', 'Madeline', 'Nevaeh', 'Evelyn', 'Maya', 'Mary', 'Michelle', 'Jada', 'Sara', 'Audrey', 'Brooklyn', 'Vanessa', 'Amanda', 'Ariana', 'Rebecca', 'Caroline', 'Amelia', 'Mariah', 'Jordan', 'Jocelyn', 'Arianna', 'Isabel', 'Marissa', 'Autumn', 'Melanie', 'Aaliyah', 'Gracie', 'Claire', 'Isabelle', 'Molly', 'Mya', 'Diana', 'Katie', 'Leslie', 'Amber', 'Danielle', 'Melissa', 'Sierra', 'Madelyn', 'Addison', 'Bailey', 'Catherine', 'Gianna', 'Amy', 'Erin', 'Jade', 'Angela', 'Gabriela', 'Jacqueline', 'Shelby', 'Kennedy', 'Lydia', 'Alondra', 'Adriana', 'Daniela', 'Natalia', 'Breanna', 'Kathryn', 'Briana', 'Ashlyn', 'Rylee', 'Eva', 'Kendall', 'Peyton', 'Ruby', 'Alexandria', 'Sophie', 'Charlotte', 'Reagan', 'Valeria', 'Christina', 'Summer', 'Kate', 'Mikayla', 'Naomi', 'Layla', 'Miranda', 'Laura', 'Ana', 'Angel', 'Alicia', 'Daisy', 'Ciara', 'Margaret', 'Aubrey', 'Zoey', 'Skylar', 'Genesis', 'Payton', 'Courtney', 'Kylee', 'Kiara', 'Alexia', 'Jillian', 'Lindsey', 'Mckenzie', 'Karen', 'Giselle', 'Mariana', 'Valerie', 'Sabrina', 'Alana', 'Serenity', 'Kelsey', 'Cheyenne', 'Juliana', 'Lucy', 'Kelly', 'Sadie', 'Bianca', 'Kyra', 'Nadia', 'Lilly', 'Caitlyn', 'Jasmin', 'Ellie', 'Hope', 'Cassandra', 'Jazmin', 'Crystal', 'Jordyn', 'Cassidy', 'Delaney', 'Liliana', 'Angelica', 'Caitlin', 'Kyla', 'Jayla', 'Adrianna', 'Tiffany', 'Abby', 'Carly', 'Chelsea', 'Camila', 'Erica', 'Makenzie', 'Karla', 'Cadence', 'Paris', 'Veronica', 'Mckenna', 'Brenda', 'Bella', 'Maggie', 'Karina', 'Esmeralda', 'Erika', 'Makenna', 'Julianna', 'Elena', 'Mallory', 'Jamie', 'Alejandra', 'Cynthia', 'Ariel', 'Vivian', 'Jayden', 'Amaya', 'Dakota', 'Elise', 'Haylee', 'Josephine', 'Aniyah', 'Bethany', 'Keira', 'Aliyah', 'Laila', 'Camryn', 'Fatima', 'Reese', 'Annabelle', 'Monica', 'Lindsay', 'Kira', 'Selena', 'Macy', 'Hanna', 'Heaven', 'Clara', 'Katrina', 'Jazmine', 'Jadyn', 'Stella'];

    first_names text[];
    status int;
    name text;
    email text;
    new_user users%rowtype;
    i int := 1;
BEGIN
    WHILE i <= count LOOP

        name := '';
        status := FLOOR(RANDOM() * 10);

        IF MOD(status, 2) = 1 THEN
            first_names = boy_names;
        ELSE
            first_names = girl_names;
        END IF;

        -- 20% chance they have multiple first names
        IF status >= 8 THEN
            -- +1 because psql arrays are 1-index starting and random() goes 0 <= x < 1
            name = name || first_names[FLOOR((RANDOM()*ARRAY_LENGTH(first_names, 1))+1)::int] || ' ';
        END IF;

        name = name || first_names[FLOOR((RANDOM()*ARRAY_LENGTH(first_names, 1))+1)::int] || ' ';
        name = name || surnames[FLOOR((RANDOM()*ARRAY_LENGTH(surnames, 1))+1)::int];

        email = LOWER(name);
        email = REPLACE(email, ' ', '.') || '@example.com';

        BEGIN
          INSERT INTO users (name, uid) VALUES (name, email)
          RETURNING * INTO new_user;
        EXCEPTION WHEN unique_violation THEN
          CONTINUE;
        END;

        IF course_instance_id IS NOT NULL THEN
            INSERT INTO enrollments (user_id, course_instance_id, role)
                VALUES (new_user.user_id, course_instance_id, 'Student');
        END IF;

        i := i+1;
        RETURN NEXT new_user;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
